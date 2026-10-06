"use strict";

/*
DESTINATION PATH:
server/tools/gh-mobility-browser-agent/agent.js

GH Mobility Local Browser Agent - automatic controller mode.

WHAT IT DOES
- Runs quietly on the office Windows computer.
- Listens ONLY on 127.0.0.1:18733.
- Marketplace -> Connect / Login hands it a short-lived, connection-scoped token.
- Opens a separate Chrome/Edge browser profile for EACH BrokerIntegration connectionId.
- The account owner enters username/password/MFA directly on the broker portal.
- Observes structured JSON network responses and sends them to:
    /api/provider-portal-bridge/discovery
- Discovery is READ ONLY. No Claim/Accept is performed here.

SECURITY
- No portal username/password/MFA is accepted by this local controller.
- No portal credentials are sent to GH Mobility.
- Pair token is scoped to tenant + BrokerIntegration connectionId.
- Local controller binds to 127.0.0.1 only.
- Browser profiles are temporary and removed on Disconnect/agent shutdown.
*/

const {spawn}=require("child_process");
const fs=require("fs");
const os=require("os");
const path=require("path");
const http=require("http");
const https=require("https");
const net=require("net");
const WebSocket=require("ws");

const CONTROLLER_HOST="127.0.0.1";
const CONTROLLER_PORT=18733;
const MAX_BODY=5_000_000;
const sessions=new Map();

function clean(value){
  return String(value??"").trim();
}

function json(res,status,payload,origin=""){
  const body=Buffer.from(JSON.stringify(payload),"utf8");

  const headers={
    "Content-Type":"application/json; charset=utf-8",
    "Content-Length":body.length,
    "Cache-Control":"no-store",
    "Access-Control-Allow-Methods":"GET,POST,OPTIONS",
    "Access-Control-Allow-Headers":"Content-Type",
    "Access-Control-Allow-Private-Network":"true",
    "Vary":"Origin"
  };

  if(origin && allowedOrigin(origin)){
    headers["Access-Control-Allow-Origin"]=origin;
  }

  res.writeHead(status,headers);
  res.end(body);
}

function allowedOrigin(origin){
  const value=clean(origin);

  if(!value){
    return true;
  }

  try{
    const u=new URL(value);

    if(
      u.protocol==="https:" &&
      (
        u.hostname==="ghmobility.com" ||
        u.hostname.endsWith(".ghmobility.com")
      )
    ){
      return true;
    }

    if(
      ["http:","https:"].includes(u.protocol) &&
      ["localhost","127.0.0.1"].includes(u.hostname)
    ){
      return true;
    }

    return false;
  }catch(_){
    return false;
  }
}

function readRequestBody(req){
  return new Promise((resolve,reject)=>{
    const chunks=[];
    let size=0;

    req.on("data",chunk=>{
      size+=chunk.length;

      if(size>1024*1024){
        reject(new Error("Local agent request is too large"));
        req.destroy();
        return;
      }

      chunks.push(chunk);
    });

    req.on("end",()=>{
      try{
        const text=Buffer.concat(chunks).toString("utf8");
        resolve(text ? JSON.parse(text) : {});
      }catch(err){
        reject(new Error("Invalid JSON request"));
      }
    });

    req.on("error",reject);
  });
}

function findBrowser(){
  const candidates=
    process.platform==="win32"
      ? [
          process.env.PROGRAMFILES &&
            path.join(
              process.env.PROGRAMFILES,
              "Google","Chrome","Application","chrome.exe"
            ),

          process.env["PROGRAMFILES(X86)"] &&
            path.join(
              process.env["PROGRAMFILES(X86)"],
              "Google","Chrome","Application","chrome.exe"
            ),

          process.env.LOCALAPPDATA &&
            path.join(
              process.env.LOCALAPPDATA,
              "Google","Chrome","Application","chrome.exe"
            ),

          process.env.PROGRAMFILES &&
            path.join(
              process.env.PROGRAMFILES,
              "Microsoft","Edge","Application","msedge.exe"
            ),

          process.env["PROGRAMFILES(X86)"] &&
            path.join(
              process.env["PROGRAMFILES(X86)"],
              "Microsoft","Edge","Application","msedge.exe"
            )
        ]
      : [
          "/usr/bin/google-chrome",
          "/usr/bin/google-chrome-stable",
          "/usr/bin/chromium",
          "/usr/bin/chromium-browser",
          "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
        ];

  return candidates
    .filter(Boolean)
    .find(file=>fs.existsSync(file)) ||
    null;
}

function removeDirSafe(dir){
  try{
    fs.rmSync(
      dir,
      {
        recursive:true,
        force:true
      }
    );
  }catch(_){}
}

function getFreePort(){
  return new Promise((resolve,reject)=>{
    const server=
      net.createServer();

    server.unref();

    server.on(
      "error",
      reject
    );

    server.listen(
      0,
      CONTROLLER_HOST,
      ()=>{
        const address=
          server.address();

        const port=
          Number(
            address?.port ||
            0
          );

        server.close(
          ()=>resolve(port)
        );
      }
    );
  });
}

function getJson(url){
  return new Promise((resolve,reject)=>{
    http.get(
      url,
      res=>{
        let data="";

        res.on(
          "data",
          chunk=>data+=chunk
        );

        res.on(
          "end",
          ()=>{
            try{
              resolve(
                JSON.parse(data)
              );
            }catch(err){
              reject(err);
            }
          }
        );
      }
    )
    .on(
      "error",
      reject
    );
  });
}

function postJson(
  urlString,
  payload,
  bearerToken
){
  return new Promise((resolve,reject)=>{
    let u;

    try{
      u=new URL(urlString);
    }catch(err){
      return reject(err);
    }

    const transport=
      u.protocol==="https:"
        ? https
        : http;

    const body=
      Buffer.from(
        JSON.stringify(payload),
        "utf8"
      );

    const request=
      transport.request(
        {
          protocol:u.protocol,
          hostname:u.hostname,
          port:u.port||undefined,
          path:`${u.pathname}${u.search}`,
          method:"POST",
          headers:{
            "Content-Type":"application/json",
            "Content-Length":body.length,
            "Authorization":`Bearer ${bearerToken}`
          },
          timeout:15000
        },
        response=>{
          let data="";

          response.on(
            "data",
            chunk=>data+=chunk
          );

          response.on(
            "end",
            ()=>{
              let parsed={};

              try{
                parsed=
                  data
                    ? JSON.parse(data)
                    : {};
              }catch(_){
                parsed={
                  raw:data
                };
              }

              if(
                response.statusCode>=200 &&
                response.statusCode<300
              ){
                return resolve(parsed);
              }

              const err=
                new Error(
                  parsed.message ||
                  `GH bridge HTTP ${response.statusCode}`
                );

              err.statusCode=
                response.statusCode;

              reject(err);
            }
          );
        }
      );

    request.on(
      "timeout",
      ()=>request.destroy(
        new Error(
          "GH bridge request timed out"
        )
      )
    );

    request.on(
      "error",
      reject
    );

    request.write(body);
    request.end();
  });
}

function lowerKeys(obj){
  const out={};

  for(
    const [key,value]
    of Object.entries(obj||{})
  ){
    out[
      String(key).toLowerCase()
    ]=value;
  }

  return out;
}

const TRIP_HINTS=[
  "availabletaskid",
  "tripid",
  "tripnumber",
  "assignmentnumber",
  "reservationid",
  "pickuplocation",
  "pickupaddress",
  "pickupdatetime",
  "pickupdatetimelocal",
  "pickuptime",
  "dropofflocation",
  "dropoffaddress",
  "dropoffdatetime",
  "dropofftime",
  "appointmenttime",
  "appointmentdatetime",
  "distance",
  "distancemeters",
  "tripmiles",
  "levelofservice",
  "mode",
  "member",
  "membername",
  "passengertype"
];

function scoreTripObject(obj){
  if(
    !obj ||
    typeof obj!=="object" ||
    Array.isArray(obj)
  ){
    return 0;
  }

  const keys=
    Object.keys(
      lowerKeys(obj)
    );

  let score=0;

  for(
    const hint
    of TRIP_HINTS
  ){
    if(
      keys.includes(hint)
    ){
      score++;
    }
  }

  const hasPickup=
    keys.some(
      key=>key.includes("pickup")
    );

  const hasDropoff=
    keys.some(
      key=>key.includes("dropoff")
    );

  const hasId=
    keys.some(
      key=>
        /(^|_)(trip|task|reservation|assignment).*id$/
          .test(key)
    ) ||
    keys.includes("availabletaskid") ||
    keys.includes("tripnumber");

  if(
    hasPickup &&
    hasDropoff
  ){
    score+=4;
  }

  if(hasId){
    score+=2;
  }

  return score;
}

function stableId(
  obj,
  fallback
){
  const keys=
    lowerKeys(obj);

  return String(
    keys.availabletaskid ??
    keys.tripid ??
    keys.tripnumber ??
    keys.assignmentnumber ??
    keys.reservationid ??
    keys.id ??
    fallback
  );
}

class PortalSession{
  constructor(options){
    this.connectionId=
      clean(
        options.connectionId
      );

    this.portalUrl=
      clean(
        options.portalUrl
      );

    this.ghBaseUrl=
      clean(
        options.ghBaseUrl
      )
      .replace(/\/+$/,"");

    this.agentToken=
      clean(
        options.agentToken
      );

    this.brokerName=
      clean(
        options.brokerName
      );

    this.brokerCode=
      clean(
        options.brokerCode
      );

    this.accountLabel=
      clean(
        options.accountLabel
      ) ||
      "Primary Account";

    this.browserPath=
      findBrowser();

    this.debugPort=0;
    this.profileDir="";
    this.outputDir=
      path.join(
        __dirname,
        "discovery-output",
        this.connectionId
      );

    this.browserProcess=null;
    this.ws=null;
    this.nextId=1;
    this.pending=new Map();
    this.discovered=new Map();
    this.responseMeta=new Map();
    this.bridgeQueue=[];
    this.bridgeSeen=new Set();
    this.bridgeBusy=false;
    this.startedAt=null;
    this.lastDiscoveryAt=null;
    this.lastError="";
    this.stopping=false;
  }

  bridgeEndpoint(){
    return (
      `${this.ghBaseUrl}` +
      "/api/provider-portal-bridge/discovery"
    );
  }

  validate(){
    if(!this.connectionId){
      throw new Error(
        "connectionId is required"
      );
    }

    if(!this.agentToken){
      throw new Error(
        "Agent token is required"
      );
    }

    if(!this.browserPath){
      throw new Error(
        "Chrome or Edge was not found on this computer"
      );
    }

    let gh;

    try{
      gh=
        new URL(
          this.ghBaseUrl
        );
    }catch(_){
      throw new Error(
        "Invalid GH Mobility URL"
      );
    }

    if(
      gh.protocol!=="https:" &&
      ![
        "localhost",
        "127.0.0.1"
      ].includes(
        gh.hostname
      )
    ){
      throw new Error(
        "GH Mobility URL must use HTTPS"
      );
    }

    let portal;

    try{
      portal=
        new URL(
          this.portalUrl
        );
    }catch(_){
      throw new Error(
        "Invalid Provider Portal URL"
      );
    }

    if(
      ![
        "http:",
        "https:"
      ].includes(
        portal.protocol
      )
    ){
      throw new Error(
        "Provider Portal URL must use HTTP or HTTPS"
      );
    }
  }

  async start(){
    this.validate();

    fs.mkdirSync(
      this.outputDir,
      {
        recursive:true
      }
    );

    this.profileDir=
      fs.mkdtempSync(
        path.join(
          os.tmpdir(),
          `gh-mobility-${this.connectionId}-`
        )
      );

    this.debugPort=
      await getFreePort();

    const args=[
      `--remote-debugging-port=${this.debugPort}`,
      `--user-data-dir=${this.profileDir}`,
      "--no-first-run",
      "--no-default-browser-check",
      "--disable-background-networking",
      "--new-window",
      this.portalUrl
    ];

    this.browserProcess=
      spawn(
        this.browserPath,
        args,
        {
          stdio:"ignore",
          detached:false
        }
      );

    this.browserProcess.on(
      "exit",
      ()=>{
        if(!this.stopping){
          this.stop().catch(()=>{});
        }
      }
    );

    await this.attach();

    this.startedAt=
      new Date()
        .toISOString();

    return this.status();
  }

  async waitForTarget(){
    for(
      let i=0;
      i<100;
      i++
    ){
      try{
        const targets=
          await getJson(
            `http://127.0.0.1:${this.debugPort}/json`
          );

        const page=
          targets.find(
            target=>
              target.type==="page" &&
              target.webSocketDebuggerUrl
          );

        if(page){
          return page;
        }
      }catch(_){}

      await new Promise(
        resolve=>
          setTimeout(
            resolve,
            200
          )
      );
    }

    throw new Error(
      "Could not attach to the broker browser"
    );
  }

  send(
    method,
    params={}
  ){
    return new Promise((resolve,reject)=>{
      const id=
        this.nextId++;

      this.pending.set(
        id,
        {
          resolve,
          reject
        }
      );

      this.ws.send(
        JSON.stringify({
          id,
          method,
          params
        })
      );
    });
  }

  async attach(){
    const target=
      await this.waitForTarget();

    this.ws=
      new WebSocket(
        target.webSocketDebuggerUrl
      );

    this.ws.on(
      "message",
      async raw=>{
        let message;

        try{
          message=
            JSON.parse(
              String(raw)
            );
        }catch(_){
          return;
        }

        if(
          message.id &&
          this.pending.has(
            message.id
          )
        ){
          const pending=
            this.pending.get(
              message.id
            );

          this.pending.delete(
            message.id
          );

          if(message.error){
            pending.reject(
              new Error(
                message.error.message ||
                "CDP error"
              )
            );
          }else{
            pending.resolve(
              message.result
            );
          }

          return;
        }

        if(
          message.method===
          "Network.responseReceived"
        ){
          const response=
            message.params.response ||
            {};

          let host="";

          try{
            host=
              new URL(
                response.url
              ).host;
          }catch(_){}

          this.responseMeta.set(
            message.params.requestId,
            {
              url:response.url,
              host,
              status:response.status,
              mimeType:response.mimeType
            }
          );
        }

        if(
          message.method===
          "Network.loadingFinished"
        ){
          await this.inspectResponse(
            message.params
          );
        }
      }
    );

    await new Promise(
      (resolve,reject)=>{
        this.ws.once(
          "open",
          resolve
        );

        this.ws.once(
          "error",
          reject
        );
      }
    );

    await this.send(
      "Network.enable",
      {
        maxTotalBufferSize:
          100000000,

        maxResourceBufferSize:
          10000000
      }
    );

    await this.send(
      "Page.enable"
    );
  }

  queueBridgePayload(
    payload,
    meta
  ){
    const fingerprint=
      `${meta.url}|${meta.requestId}`;

    if(
      this.bridgeSeen.has(
        fingerprint
      )
    ){
      return;
    }

    this.bridgeSeen.add(
      fingerprint
    );

    this.bridgeQueue.push({
      payload,
      meta
    });

    this.flushBridgeQueue()
      .catch(()=>{});
  }

  async flushBridgeQueue(){
    if(this.bridgeBusy){
      return;
    }

    this.bridgeBusy=true;

    try{
      while(
        this.bridgeQueue.length
      ){
        const item=
          this.bridgeQueue[0];

        try{
          const result=
            await postJson(
              this.bridgeEndpoint(),
              {
                payload:
                  item.payload,

                sourceUrl:
                  item.meta.url ||
                  "",

                operationName:
                  "LOCAL_BROWSER_DISCOVERY"
              },
              this.agentToken
            );

          this.lastDiscoveryAt=
            new Date()
              .toISOString();

          this.lastError="";

          this.bridgeQueue.shift();

          console.log(
            `[${this.connectionId}] GH discovery accepted; normalized=${Number(result?.normalized?.total||0)}`
          );

        }catch(err){
          this.lastError=
            err.message ||
            String(err);

          console.error(
            `[${this.connectionId}] ${this.lastError}`
          );

          if(
            err.statusCode===401 ||
            err.statusCode===403
          ){
            this.bridgeQueue.length=0;
          }

          break;
        }
      }
    }finally{
      this.bridgeBusy=false;
    }
  }

  walk(
    value,
    source,
    trail="$",
    depth=0
  ){
    if(
      depth>12 ||
      value==null
    ){
      return;
    }

    if(
      Array.isArray(value)
    ){
      value.forEach(
        (child,index)=>
          this.walk(
            child,
            source,
            `${trail}[${index}]`,
            depth+1
          )
      );

      return;
    }

    if(
      typeof value!=="object"
    ){
      return;
    }

    const score=
      scoreTripObject(
        value
      );

    if(score>=5){
      const id=
        stableId(
          value,
          `${source.requestId}:${trail}`
        );

      const key=
        `${source.host}|${id}`;

      const previous=
        this.discovered.get(
          key
        );

      if(
        !previous ||
        score>previous.score
      ){
        this.discovered.set(
          key,
          {
            id,
            score,
            discoveredAt:
              new Date()
                .toISOString(),

            source:{
              url:source.url,
              host:source.host,
              status:source.status,
              mimeType:source.mimeType,
              trail
            },

            raw:value
          }
        );

        this.writeSnapshot();
      }
    }

    for(
      const [key,child]
      of Object.entries(value)
    ){
      const lower=
        key.toLowerCase();

      if(
        lower.includes("password") ||
        lower.includes("token") ||
        lower.includes("cookie") ||
        lower.includes("authorization")
      ){
        continue;
      }

      this.walk(
        child,
        source,
        `${trail}.${key}`,
        depth+1
      );
    }
  }

  writeSnapshot(){
    const payload={
      generatedAt:
        new Date()
          .toISOString(),

      connectionId:
        this.connectionId,

      brokerName:
        this.brokerName,

      accountLabel:
        this.accountLabel,

      mode:
        "READ_ONLY_DISCOVERY",

      count:
        this.discovered.size,

      trips:
        [
          ...this.discovered
            .values()
        ]
    };

    fs.mkdirSync(
      this.outputDir,
      {
        recursive:true
      }
    );

    fs.writeFileSync(
      path.join(
        this.outputDir,
        "discovered-trips.json"
      ),
      JSON.stringify(
        payload,
        null,
        2
      )
    );
  }

  async inspectResponse(params){
    const meta=
      this.responseMeta.get(
        params.requestId
      );

    if(!meta){
      return;
    }

    const mime=
      clean(
        meta.mimeType
      )
      .toLowerCase();

    if(
      !(
        mime.includes("json") ||
        mime.includes("javascript") ||
        mime.includes("text")
      )
    ){
      return;
    }

    try{
      const result=
        await this.send(
          "Network.getResponseBody",
          {
            requestId:
              params.requestId
          }
        );

      if(
        !result ||
        !result.body ||
        result.body.length>MAX_BODY
      ){
        return;
      }

      let text=
        result.body;

      if(result.base64Encoded){
        text=
          Buffer.from(
            text,
            "base64"
          )
          .toString(
            "utf8"
          );
      }

      const trimmed=
        text.trim();

      if(
        !(
          trimmed.startsWith("{") ||
          trimmed.startsWith("[")
        )
      ){
        return;
      }

      const parsed=
        JSON.parse(
          trimmed
        );

      const discoveryMeta={
        ...meta,
        requestId:
          params.requestId
      };

      this.queueBridgePayload(
        parsed,
        discoveryMeta
      );

      this.walk(
        parsed,
        discoveryMeta
      );

    }catch(_){
      /*
        Ignore non-JSON or evicted response bodies.
        Discovery continues normally.
      */
    }
  }

  status(){
    return {
      connectionId:
        this.connectionId,

      brokerName:
        this.brokerName,

      accountLabel:
        this.accountLabel,

      running:
        Boolean(
          this.browserProcess &&
          !this.browserProcess.killed
        ),

      startedAt:
        this.startedAt,

      lastDiscoveryAt:
        this.lastDiscoveryAt,

      discovered:
        this.discovered.size,

      lastError:
        this.lastError
    };
  }

  async stop(){
    if(this.stopping){
      return;
    }

    this.stopping=true;

    try{
      this.writeSnapshot();
    }catch(_){}

    try{
      if(this.ws){
        this.ws.close();
      }
    }catch(_){}

    try{
      if(
        this.browserProcess &&
        !this.browserProcess.killed
      ){
        this.browserProcess.kill();
      }
    }catch(_){}

    await new Promise(
      resolve=>
        setTimeout(
          resolve,
          200
        )
    );

    removeDirSafe(
      this.profileDir
    );
  }
}

async function connectSession(body){
  const connectionId=
    clean(
      body.connectionId
    );

  if(!connectionId){
    throw new Error(
      "connectionId is required"
    );
  }

  const existing=
    sessions.get(
      connectionId
    );

  if(
    existing &&
    existing.browserProcess &&
    !existing.browserProcess.killed
  ){
    /*
      Refresh the short-lived discovery token without opening another
      browser for the same BrokerIntegration connection.
    */
    existing.agentToken=
      clean(
        body.agentToken
      ) ||
      existing.agentToken;

    existing.ghBaseUrl=
      clean(
        body.ghBaseUrl
      )
      .replace(/\/+$/,"") ||
      existing.ghBaseUrl;

    return {
      success:true,
      alreadyRunning:true,
      session:
        existing.status()
    };
  }

  if(existing){
    await existing.stop()
      .catch(()=>{});

    sessions.delete(
      connectionId
    );
  }

  const session=
    new PortalSession(body);

  sessions.set(
    connectionId,
    session
  );

  try{
    await session.start();

    return {
      success:true,
      alreadyRunning:false,
      session:
        session.status()
    };

  }catch(err){
    await session.stop()
      .catch(()=>{});

    sessions.delete(
      connectionId
    );

    throw err;
  }
}

async function disconnectSession(
  connectionId
){
  const id=
    clean(
      connectionId
    );

  const session=
    sessions.get(id);

  if(!session){
    return {
      success:true,
      disconnected:false
    };
  }

  await session.stop()
    .catch(()=>{});

  sessions.delete(id);

  return {
    success:true,
    disconnected:true
  };
}

const controller=
  http.createServer(
    async (req,res)=>{
      const origin=
        clean(
          req.headers.origin
        );

      if(
        origin &&
        !allowedOrigin(origin)
      ){
        return json(
          res,
          403,
          {
            success:false,
            message:"Origin is not allowed"
          },
          ""
        );
      }

      if(
        req.method==="OPTIONS"
      ){
        return json(
          res,
          204,
          {},
          origin
        );
      }

      const requestUrl=
        new URL(
          req.url,
          `http://${CONTROLLER_HOST}:${CONTROLLER_PORT}`
        );

      if(
        req.method==="GET" &&
        requestUrl.pathname==="/health"
      ){
        return json(
          res,
          200,
          {
            success:true,
            service:
              "GH Mobility Browser Agent",
            version:
              "2.0",
            sessions:
              [
                ...sessions
                  .values()
              ]
              .map(
                session=>
                  session.status()
              )
          },
          origin
        );
      }

      if(
        req.method==="POST" &&
        requestUrl.pathname==="/connect"
      ){
        try{
          const body=
            await readRequestBody(
              req
            );

          const result=
            await connectSession(
              body
            );

          return json(
            res,
            200,
            result,
            origin
          );

        }catch(err){
          return json(
            res,
            500,
            {
              success:false,
              message:
                err.message ||
                String(err)
            },
            origin
          );
        }
      }

      if(
        req.method==="POST" &&
        requestUrl.pathname==="/disconnect"
      ){
        try{
          const body=
            await readRequestBody(
              req
            );

          const result=
            await disconnectSession(
              body.connectionId
            );

          return json(
            res,
            200,
            result,
            origin
          );

        }catch(err){
          return json(
            res,
            500,
            {
              success:false,
              message:
                err.message ||
                String(err)
            },
            origin
          );
        }
      }

      return json(
        res,
        404,
        {
          success:false,
          message:"Local Agent endpoint not found"
        },
        origin
      );
    }
  );

let shuttingDown=false;

async function shutdown(){
  if(shuttingDown){
    return;
  }

  shuttingDown=true;

  const active=[
    ...sessions.values()
  ];

  sessions.clear();

  await Promise.allSettled(
    active.map(
      session=>
        session.stop()
    )
  );

  controller.close(
    ()=>process.exit(0)
  );

  setTimeout(
    ()=>process.exit(0),
    1500
  )
  .unref();
}

process.on(
  "SIGINT",
  shutdown
);

process.on(
  "SIGTERM",
  shutdown
);

controller.listen(
  CONTROLLER_PORT,
  CONTROLLER_HOST,
  ()=>{
    console.log(
      `GH Mobility Browser Agent ready on http://${CONTROLLER_HOST}:${CONTROLLER_PORT}`
    );
  }
);
