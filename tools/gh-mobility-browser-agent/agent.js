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
- Portal login text entered through the GH Login Console is encrypted in the admin browser with the Oracle agent public key and decrypted only inside this local controller.
- GH Mobility relays only encrypted login text and does not store broker passwords/MFA values.
- Pair token is scoped to tenant + BrokerIntegration connectionId.
- Local controller binds to 127.0.0.1 only.
- Browser profiles are persistent per BrokerIntegration connectionId so authorized portal login/MFA sessions can survive agent/browser restarts.
- Disconnect stops the browser session but does not delete the saved provider-portal browser profile.
*/

const {spawn}=require("child_process");
const fs=require("fs");
const path=require("path");
const http=require("http");
const https=require("https");
const net=require("net");
const WebSocket=require("ws");
const crypto=require("crypto");

const CONTROLLER_HOST="127.0.0.1";
const CONTROLLER_PORT=18733;
const MAX_BODY=5_000_000;
const sessions=new Map();

const CONSOLE_KEYS=crypto.generateKeyPairSync(
  "rsa",
  {
    modulusLength:2048,
    publicKeyEncoding:{type:"spki",format:"pem"},
    privateKeyEncoding:{type:"pkcs8",format:"pem"}
  }
);
const CONSOLE_PUBLIC_KEY=CONSOLE_KEYS.publicKey;
const CONSOLE_PRIVATE_KEY=CONSOLE_KEYS.privateKey;


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

function payloadHasTripCandidate(
  value,
  depth=0
){
  if(
    depth>12 ||
    value==null
  ){
    return false;
  }

  if(Array.isArray(value)){
    return value.some(
      child=>
        payloadHasTripCandidate(
          child,
          depth+1
        )
    );
  }

  if(typeof value!=="object"){
    return false;
  }

  if(
    scoreTripObject(value)>=5
  ){
    return true;
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

    if(
      payloadHasTripCandidate(
        child,
        depth+1
      )
    ){
      return true;
    }
  }

  return false;
}

function isTelemetryUrl(urlValue){
  const value=
    clean(urlValue)
      .toLowerCase();

  return (
    value.includes("sentry.io") ||
    value.includes("google-analytics.com") ||
    value.includes("googletagmanager.com") ||
    value.includes("segment.io") ||
    value.includes("mixpanel.com") ||
    value.includes("datadoghq.com")
  );
}


function safeHost(urlValue){
  try{
    return new URL(clean(urlValue)).hostname.toLowerCase();
  }catch(_){
    return "";
  }
}

function rootDomain(host){
  const parts=clean(host).toLowerCase().split(".").filter(Boolean);
  if(parts.length<=2) return parts.join(".");
  return parts.slice(-2).join(".");
}

function samePortalFamily(urlValue,portalUrl){
  const sourceHost=safeHost(urlValue);
  const portalHost=safeHost(portalUrl);

  if(!sourceHost || !portalHost) return false;
  if(sourceHost===portalHost) return true;
  if(sourceHost.endsWith(`.${portalHost}`)) return true;
  if(portalHost.endsWith(`.${sourceHost}`)) return true;

  return rootDomain(sourceHost)===rootDomain(portalHost);
}

function isSensitiveObjectKey(key){
  const lower=clean(key).toLowerCase();

  return (
    lower.includes("password") ||
    lower.includes("passwd") ||
    lower.includes("token") ||
    lower.includes("cookie") ||
    lower.includes("authorization") ||
    lower.includes("secret") ||
    lower.includes("session")
  );
}

function scalarFieldCount(obj){
  if(!obj || typeof obj!=="object" || Array.isArray(obj)) return 0;

  let count=0;

  for(const [key,value] of Object.entries(obj)){
    if(isSensitiveObjectKey(key)) continue;

    if(
      value===null ||
      ["string","number","boolean"].includes(typeof value)
    ){
      count++;
    }
  }

  return count;
}

function schemaSignature(obj){
  if(!obj || typeof obj!=="object" || Array.isArray(obj)) return "";

  return Object.keys(obj)
    .filter(key=>!isSensitiveObjectKey(key))
    .sort()
    .slice(0,40)
    .join("|");
}

function extractStructuredRows(value,depth=0){
  if(depth>10 || value==null) return [];

  if(Array.isArray(value)){
    const objects=value.filter(
      item=>item && typeof item==="object" && !Array.isArray(item)
    );

    if(objects.length){
      const groups=new Map();

      for(const item of objects.slice(0,60)){
        if(scalarFieldCount(item)<3) continue;

        const signature=schemaSignature(item);

        if(!signature) continue;

        if(!groups.has(signature)){
          groups.set(signature,[]);
        }

        groups.get(signature).push(item);
      }

      const best=
        [...groups.values()]
          .sort((a,b)=>b.length-a.length)[0];

      if(best && best.length>=1){
        return best.slice(0,40);
      }
    }

    for(const item of value.slice(0,25)){
      const nested=
        extractStructuredRows(
          item,
          depth+1
        );

      if(nested.length){
        return nested;
      }
    }

    return [];
  }

  if(typeof value!=="object"){
    return [];
  }

  for(const [key,child] of Object.entries(value)){
    if(isSensitiveObjectKey(key)) continue;

    const nested=
      extractStructuredRows(
        child,
        depth+1
      );

    if(nested.length){
      return nested;
    }
  }

  return [];
}

function simpleFingerprint(value){
  const text=JSON.stringify(value);
  let hash=0;

  for(let i=0;i<text.length;i++){
    hash=((hash<<5)-hash)+text.charCodeAt(i);
    hash|=0;
  }

  return String(Math.abs(hash));
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

    /*
      Keep one persistent Chromium profile per Marketplace connection.
      This intentionally preserves only the browser's normal local profile
      state (for example, cookies created after the account owner completes
      login/MFA directly on the provider portal). GH Mobility never receives
      the provider password, MFA code, cookies, or authorization headers.
    */
    this.profileRoot=
      clean(process.env.GH_BROWSER_PROFILE_ROOT) ||
      path.join(
        __dirname,
        "browser-profiles"
      );

    this.profileDir=
      path.join(
        this.profileRoot,
        String(this.connectionId)
          .replace(/[^A-Za-z0-9._-]/g,"_")
      );

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

    this.currentUrl="";
    this.currentTitle="";
    this.debugAttached=false;
    this.loginDetected=false;
    this.tripsPageDetected=false;
    this.networkCandidates=0;
    this.domCandidates=0;
    this.discoveriesPosted=0;
    this.lastDiscoveryType="";
    this.lastMapperReady=false;
    this.lastMapperMethod="";
    this.lastActionDetected=false;
    this.lastActionConfidence=0;
    this.domTimer=null;
    this.pageProbeBusy=false;
    this.lastDomFingerprint="";
    this.lastDomSentAt=0;

    // Generic SaaS auto-monitoring state. These are isolated per connectionId.
    this.lastAutoNavigateAt=0;
    this.lastAutoRefreshAt=0;
    this.visitedPortalUrls=new Set();
    this.learnedListingUrl="";
    this.portalDiscoveryStateFile=
      path.join(
        this.profileDir,
        "gh-marketplace-discovery.json"
      );
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

    fs.mkdirSync(
      this.profileDir,
      {
        recursive:true
      }
    );

    try{
      const saved=
        JSON.parse(
          fs.readFileSync(
            this.portalDiscoveryStateFile,
            "utf8"
          )
        );

      const candidate=clean(saved?.learnedListingUrl);

      if(candidate){
        const parsed=new URL(candidate);
        const portal=new URL(this.portalUrl);

        if(parsed.origin===portal.origin){
          this.learnedListingUrl=candidate;
        }
      }
    }catch(_){}

    this.debugPort=
      await getFreePort();

    const args=[
      `--remote-debugging-port=${this.debugPort}`,
      `--user-data-dir=${this.profileDir}`,
      "--no-first-run",
      "--no-default-browser-check",
      "--disable-background-networking",
      "--window-size=1440,900",
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

    /*
      Network JSON is the primary discovery path. DOM inspection is the
      fallback for portals that render trip tables/cards without useful JSON.
    */
    this.domTimer=
      setInterval(
        ()=>this.inspectDom().catch(()=>{}),
        1200
      );

    this.domTimer.unref?.();

    this.inspectDom().catch(()=>{});

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

    await this.send(
      "Runtime.enable"
    );

    this.debugAttached=true;
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

                discoveryType:
                  item.meta.discoveryType ||
                  "NETWORK_JSON",

                actionCandidates:
                  Array.isArray(
                    item.meta.actionCandidates
                  )
                    ? item.meta.actionCandidates
                    : [],

                operationName:
                  "LOCAL_BROWSER_DISCOVERY"
              },
              this.agentToken
            );

          this.lastDiscoveryAt=
            new Date()
              .toISOString();

          this.lastDiscoveryType=
            clean(
              item.meta.discoveryType ||
              "NETWORK_JSON"
            );

          this.lastMapperReady=
            result?.normalized?.mapper?.ready===true;

          this.lastMapperMethod=
            clean(
              result?.normalized?.mapper?.method ||
              ""
            );

          this.lastActionDetected=
            this.lastActionDetected ||
            Boolean(
              result?.actionProfile?.detected
            );

          this.lastActionConfidence=
            Number(
              result?.actionProfile?.confidence ||
              this.lastActionConfidence ||
              0
            );

          this.discoveriesPosted++;

          this.lastError="";

          this.bridgeQueue.shift();

          console.log(
            `[${this.connectionId}] GH discovery accepted; normalized=${Number(result?.normalized?.total||0)}; mapper=${this.lastMapperMethod||"WAITING"}`
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

  async inspectDom(){
    if(
      this.pageProbeBusy ||
      this.stopping ||
      !this.ws ||
      this.ws.readyState!==WebSocket.OPEN
    ){
      return;
    }

    this.pageProbeBusy=true;

    try{
      const expression=`
        (()=>{
          const clean=v=>String(v??"").replace(/\\s+/g," ").trim();

          const visible=el=>{
            if(!el) return false;
            const style=getComputedStyle(el);
            const rect=el.getBoundingClientRect();

            return (
              style.display!=="none" &&
              style.visibility!=="hidden" &&
              rect.width>0 &&
              rect.height>0
            );
          };

          const selectorFor=el=>{
            if(!el || !el.tagName) return "";

            if(
              el.id &&
              /^[A-Za-z][A-Za-z0-9_\\-:.]*$/.test(el.id)
            ){
              return "#"+CSS.escape(el.id);
            }

            const parts=[];
            let current=el;

            for(
              let depth=0;
              current &&
              current.nodeType===1 &&
              depth<6;
              depth++,current=current.parentElement
            ){
              let part=current.tagName.toLowerCase();

              const stable=
                [...current.classList]
                  .filter(x=>x && !/active|hover|focus|selected/i.test(x))
                  .slice(0,2);

              if(stable.length){
                part+="."+stable.map(x=>CSS.escape(x)).join(".");
              }

              const parent=current.parentElement;

              if(parent){
                const siblings=
                  [...parent.children]
                    .filter(x=>x.tagName===current.tagName);

                if(siblings.length>1){
                  part+=":nth-of-type("+(siblings.indexOf(current)+1)+")";
                }
              }

              parts.unshift(part);

              if(current.id){
                break;
              }
            }

            return parts.join(" > ");
          };

          const uniqueKey=(label,index)=>{
            const value=
              clean(label) ||
              ("Column "+(index+1));

            return value.slice(0,100);
          };

          const actionWords=
            /\\b(accept|claim|take|book|reserve|assign|select\\s+trip|add\\s+trip|choose\\s+trip)\\b/i;

          const rowAcceptEvidence=container=>{
            if(!container){
              return {
                available:false,
                text:"",
                selector:""
              };
            }

            const controls=
              [
                ...container.querySelectorAll(
                  'button,a,[role="button"],input[type="button"],input[type="submit"]'
                )
              ]
              .filter(visible);

            for(const el of controls){
              const text=
                clean(
                  el.innerText ||
                  el.textContent ||
                  el.value ||
                  el.getAttribute("aria-label") ||
                  el.getAttribute("title")
                )
                .slice(0,100);

              const disabled=Boolean(
                el.disabled ||
                el.getAttribute("aria-disabled")==="true"
              );

              if(
                text &&
                actionWords.test(text) &&
                !disabled
              ){
                return {
                  available:true,
                  text,
                  selector:selectorFor(el)
                };
              }
            }

            return {
              available:false,
              text:"",
              selector:""
            };
          };

          const rows=[];

          const tables=
            [...document.querySelectorAll("table")]
              .filter(visible)
              .slice(0,12);

          for(const table of tables){
            let headers=
              [...table.querySelectorAll("thead th")]
                .map(x=>clean(x.innerText||x.textContent));

            const tr=
              [...table.querySelectorAll("tr")]
                .filter(visible);

            if(!headers.length && tr.length){
              headers=
                [...tr[0].querySelectorAll("th,td")]
                  .map(x=>clean(x.innerText||x.textContent));
            }

            for(const row of tr.slice(headers.length?1:0,31)){
              const cells=
                [...row.querySelectorAll(":scope > th,:scope > td")];

              if(cells.length<3){
                continue;
              }

              const obj={};

              cells.slice(0,24).forEach(
                (cell,index)=>{
                  const value=
                    clean(cell.innerText||cell.textContent)
                      .slice(0,800);

                  if(value){
                    obj[uniqueKey(headers[index],index)]=value;
                  }
                }
              );

              if(Object.keys(obj).length>=3){
                const accept=
                  rowAcceptEvidence(
                    row
                  );

                obj.__ghAcceptAvailable=
                  accept.available===true;

                obj.__ghAcceptActionText=
                  accept.text;

                obj.__ghAcceptSelector=
                  accept.selector;

                rows.push(obj);
              }

              if(rows.length>=50){
                break;
              }
            }

            if(rows.length>=50){
              break;
            }
          }

          if(rows.length<50){
            const cardSelectors=[
              '[role="row"]',
              '[class*="trip" i]',
              '[class*="ride" i]',
              '[class*="task" i]',
              '[class*="reservation" i]',
              '.card'
            ].join(",");

            const cards=
              [...document.querySelectorAll(cardSelectors)]
                .filter(visible)
                .slice(0,80);

            for(const card of cards){
              const obj={};

              const labelled=
                [...card.querySelectorAll("[data-label],dt,th,label")]
                  .slice(0,30);

              for(const labelEl of labelled){
                const label=
                  clean(
                    labelEl.getAttribute("data-label") ||
                    labelEl.innerText ||
                    labelEl.textContent
                  );

                if(!label){
                  continue;
                }

                let valueEl=null;

                if(labelEl.matches("dt")){
                  valueEl=labelEl.nextElementSibling;
                }

                if(!valueEl && labelEl.parentElement){
                  valueEl=
                    [...labelEl.parentElement.children]
                      .find(x=>x!==labelEl) ||
                    null;
                }

                const value=
                  clean(
                    valueEl?.innerText ||
                    valueEl?.textContent ||
                    ""
                  );

                if(value && value!==label){
                  obj[label.slice(0,100)]=
                    value.slice(0,800);
                }
              }

              const lines=
                String(card.innerText||card.textContent||"")
                  .split(/\\n+/)
                  .map(clean)
                  .filter(Boolean);

              for(const line of lines.slice(0,40)){
                const match=
                  line.match(/^([^:]{2,80}):\\s*(.+)$/);

                if(match){
                  const label=clean(match[1]);
                  const value=clean(match[2]);

                  if(label && value){
                    obj[label]=value.slice(0,800);
                  }
                }
              }

              if(Object.keys(obj).length>=3){
                const accept=
                  rowAcceptEvidence(
                    card
                  );

                obj.__ghAcceptAvailable=
                  accept.available===true;

                obj.__ghAcceptActionText=
                  accept.text;

                obj.__ghAcceptSelector=
                  accept.selector;

                rows.push(obj);

                if(rows.length>=50){
                  break;
                }
              }
            }
          }

          const actionCandidates=
            [
              ...document.querySelectorAll(
                'button,a,[role="button"],input[type="button"],input[type="submit"]'
              )
            ]
            .filter(visible)
            .map(el=>{
              const text=
                clean(
                  el.innerText ||
                  el.textContent ||
                  el.value ||
                  el.getAttribute("aria-label") ||
                  el.getAttribute("title")
                )
                .slice(0,100);

              return {
                text,
                selector:selectorFor(el),
                tag:String(el.tagName||"").toLowerCase(),
                role:clean(el.getAttribute("role")),
                disabled:Boolean(
                  el.disabled ||
                  el.getAttribute("aria-disabled")==="true"
                )
              };
            })
            .filter(
              item=>
                item.text &&
                actionWords.test(item.text) &&
                !item.disabled
            )
            .slice(0,30);

          const bodyText=
            clean(document.body?.innerText||"")
              .slice(0,12000);

          const hasPassword=
            Boolean(
              document.querySelector('input[type="password"]')
            );

          const urlLooksLikeLogin=
            /\/(login|signin|sign-in|auth)(?:[\/?#]|$)/i.test(
              String(location.pathname||"")+
              String(location.search||"")
            );

          const loginDetected=
            !hasPassword &&
            !urlLooksLikeLogin &&
            bodyText.length>80;

          /*
            Structural trip-page detection.
            It does not depend on portal menu/page names.
          */
          const datePattern=
            /\b(?:\d{1,2}[\/-]\d{1,2}[\/-]\d{2,4}|\d{4}-\d{1,2}-\d{1,2})\b/;

          const timePattern=
            /\b(?:\d{1,2}:\d{2}\s*(?:AM|PM)?|\d{1,2}\s*(?:AM|PM))\b/i;

          const addressPattern=
            /\b\d{1,6}\s+[A-Za-z0-9.'#\- ]{2,60}\b/;

          const semanticKeyPattern=
            /\b(pick.?up|drop.?off|origin|destination|address|date|time|appointment|member|client|rider|passenger|service|miles?|distance|trip|ride|reservation|task|job|reference|confirmation|id)\b/i;

          const tripLikeRows=
            rows.filter(row=>{
              const entries=
                Object.entries(row||{})
                  .filter(([key])=>!String(key).startsWith("__gh"));

              if(entries.length<3){
                return false;
              }

              let score=0;
              const keys=
                entries.map(([key])=>clean(key)).join(" ");

              if(semanticKeyPattern.test(keys)){
                score+=2;
              }

              const values=
                entries.map(([,value])=>clean(value)).join(" ");

              if(datePattern.test(values)) score++;
              if(timePattern.test(values)) score++;
              if(addressPattern.test(values)) score++;
              if(/\b\d+(?:\.\d+)?\s*(?:mi|mile|miles)\b/i.test(values)) score++;

              return score>=3;
            });

          const tripsPageDetected=
            tripLikeRows.length>0;

          /*
            Safe generic crawler:
            only same-origin anchors are visited. Arbitrary buttons are not
            clicked, and transactional/destructive destinations are excluded.
          */
          const dangerousNavigation=
            /\b(accept|claim|book|reserve|assign|delete|remove|cancel|decline|reject|logout|log.?out|sign.?out|pay|payment|billing|purchase|checkout|submit|confirm)\b/i;

          const navigationCandidates=
            [
              ...document.querySelectorAll('a[href]')
            ]
            .filter(visible)
            .map(el=>{
              const text=
                clean(
                  el.innerText ||
                  el.textContent ||
                  el.getAttribute("aria-label") ||
                  el.getAttribute("title")
                )
                .slice(0,160);

              let href="";

              try{
                const parsed=
                  new URL(
                    el.getAttribute("href"),
                    location.href
                  );

                if(
                  ["http:","https:"].includes(parsed.protocol) &&
                  parsed.origin===location.origin
                ){
                  parsed.hash="";
                  href=parsed.href;
                }
              }catch(_){}

              return {
                text,
                href
              };
            })
            .filter(item=>
              item.href &&
              item.href!==location.href &&
              !dangerousNavigation.test(
                String(item.text||"")+" "+String(item.href||"")
              )
            )
            .slice(0,100);

          const refreshCandidates=
            [
              ...document.querySelectorAll(
                'button,a,[role="button"]'
              )
            ]
            .filter(visible)
            .map(el=>{
              const text=
                clean(
                  el.innerText ||
                  el.textContent ||
                  el.getAttribute("aria-label") ||
                  el.getAttribute("title")
                )
                .slice(0,80);

              return {
                text,
                selector:selectorFor(el),
                disabled:Boolean(
                  el.disabled ||
                  el.getAttribute("aria-disabled")==="true"
                )
              };
            })
            .filter(item=>
              item.text &&
              /\b(refresh|reload|update)\b/i.test(item.text) &&
              !actionWords.test(item.text) &&
              !item.disabled
            )
            .slice(0,10);

          return {
            url:location.href,
            title:document.title||"",
            loginDetected,
            tripsPageDetected,
            structuralTripCount:tripLikeRows.length,
            rows:rows.slice(0,50),
            actionCandidates,
            navigationCandidates,
            refreshCandidates
          };
        })()
      `;

      const evaluated=
        await this.send(
          "Runtime.evaluate",
          {
            expression,
            returnByValue:true,
            awaitPromise:true
          }
        );

      const value=
        evaluated?.result?.value ||
        {};

      this.currentUrl=
        clean(
          value.url
        );

      this.currentTitle=
        clean(
          value.title
        );

      this.loginDetected=
        value.loginDetected===true;

      this.tripsPageDetected=
        value.tripsPageDetected===true;

      const rows=
        Array.isArray(value.rows)
          ? value.rows
          : [];

      const actionCandidates=
        Array.isArray(value.actionCandidates)
          ? value.actionCandidates
          : [];

      const navigationCandidates=
        Array.isArray(value.navigationCandidates)
          ? value.navigationCandidates
          : [];

      const refreshCandidates=
        Array.isArray(value.refreshCandidates)
          ? value.refreshCandidates
          : [];

      this.lastActionDetected=
        actionCandidates.length>0;

      const now=Date.now();

      /*
        Generic automatic portal discovery:
        crawl safe same-origin links until a structurally trip-like page is
        found. The learned listing URL is persisted per connectionId.
      */
      if(this.loginDetected===true){
        try{
          const current=
            new URL(
              this.currentUrl ||
              this.portalUrl
            );

          current.hash="";
          this.visitedPortalUrls.add(current.href);
        }catch(_){}

        if(
          this.tripsPageDetected===true &&
          this.currentUrl
        ){
          this.learnedListingUrl=this.currentUrl;

          try{
            fs.writeFileSync(
              this.portalDiscoveryStateFile,
              JSON.stringify(
                {
                  learnedListingUrl:this.learnedListingUrl,
                  learnedAt:new Date().toISOString()
                },
                null,
                2
              )
            );
          }catch(_){}
        }

        if(
          this.tripsPageDetected!==true &&
          (now-this.lastAutoNavigateAt)>=2500
        ){
          this.lastAutoNavigateAt=now;

          let nextUrl="";

          if(
            this.learnedListingUrl &&
            !this.visitedPortalUrls.has(this.learnedListingUrl)
          ){
            nextUrl=this.learnedListingUrl;
          }

          if(!nextUrl){
            const next=
              navigationCandidates.find(
                item=>
                  item?.href &&
                  !this.visitedPortalUrls.has(item.href)
              );

            nextUrl=clean(next?.href);
          }

          if(nextUrl){
            this.visitedPortalUrls.add(nextUrl);

            await this.send(
              "Page.navigate",
              {
                url:nextUrl
              }
            ).catch(()=>{});

            return;
          }
        }
      }

      /*
        Keep the structurally-detected trip listing alive automatically.
        Prefer a harmless Refresh/Reload/Update control; otherwise reload the
        current page. Accept/Claim/Book is never triggered.
      */
      if(
        this.loginDetected===true &&
        this.tripsPageDetected===true &&
        (now-this.lastAutoRefreshAt)>=8000
      ){
        this.lastAutoRefreshAt=now;

        const refreshSelector=
          clean(
            refreshCandidates[0]?.selector
          );

        if(refreshSelector){
          await this.send(
            "Runtime.evaluate",
            {
              expression:
                `(()=>{const el=document.querySelector(${JSON.stringify(refreshSelector)});if(el){el.click();return true;}return false;})()`,
              returnByValue:true,
              awaitPromise:true
            }
          ).catch(()=>{});
        }else{
          await this.send(
            "Page.reload",
            {
              ignoreCache:true
            }
          ).catch(()=>{});
        }
      }

      if(
        !rows.length &&
        !actionCandidates.length
      ){
        return;
      }

      const fingerprint=
        simpleFingerprint({
          url:this.currentUrl,
          rows:rows.slice(0,10),
          actions:
            actionCandidates
              .map(x=>x.text)
        });

      const unchanged=
        fingerprint===
        this.lastDomFingerprint;

      /*
        Re-send the current visible trip snapshot periodically even when the
        DOM has not changed. The GH backend discovery store is process-local
        and is empty after a Render restart/deploy; this heartbeat rehydrates
        it automatically without requiring a manual Re-evaluate click.
        Repeated identical snapshots do not create duplicate engine activity
        because the backend only emits discovery events for changed/new trips.
      */
      if(
        unchanged &&
        (now-this.lastDomSentAt)<30000
      ){
        return;
      }

      this.lastDomFingerprint=
        fingerprint;
      this.lastDomSentAt=now;

      if(rows.length){
        this.domCandidates+=rows.length;
      }

      this.queueBridgePayload(
        {
          __ghOnboarding:true,
          __ghDiscoveryType:"DOM",
          rows
        },
        {
          url:
            this.currentUrl ||
            this.portalUrl,

          host:
            safeHost(
              this.currentUrl ||
              this.portalUrl
            ),

          status:200,
          mimeType:"text/html",
          requestId:
            `DOM:${fingerprint}:${Math.floor(now/30000)}`,
          discoveryType:"DOM",
          actionCandidates
        }
      );

    }finally{
      this.pageProbeBusy=false;
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

      /*
        Ignore telemetry/error-monitoring JSON. For an unknown provider portal,
        accept either known trip-shaped JSON OR a repeated structured row set
        from the provider's own domain. This gives the server-side AI mapper
        enough schema information without broker-specific code.
      */
      if(
        isTelemetryUrl(discoveryMeta.url) ||
        !samePortalFamily(
          discoveryMeta.url,
          this.portalUrl
        )
      ){
        return;
      }

      const knownTripPayload=
        payloadHasTripCandidate(
          parsed
        );

      const structuredRows=
        knownTripPayload
          ? []
          : extractStructuredRows(
              parsed
            );

      if(
        !knownTripPayload &&
        !structuredRows.length
      ){
        return;
      }

      this.networkCandidates+=
        knownTripPayload
          ? 1
          : structuredRows.length;

      if(knownTripPayload){
        this.walk(
          parsed,
          discoveryMeta
        );

        this.queueBridgePayload(
          parsed,
          {
            ...discoveryMeta,
            discoveryType:"NETWORK_JSON"
          }
        );

      }else{
        const fingerprint=
          simpleFingerprint(
            structuredRows.slice(0,10)
          );

        this.queueBridgePayload(
          {
            __ghOnboarding:true,
            __ghDiscoveryType:"STRUCTURED_JSON",
            rows:structuredRows
          },
          {
            ...discoveryMeta,
            requestId:
              `STRUCTURED:${params.requestId}:${fingerprint}`,
            discoveryType:"STRUCTURED_JSON"
          }
        );
      }

    }catch(_){
      /*
        Ignore non-JSON or evicted response bodies.
        Discovery continues normally.
      */
    }
  }


  async consoleViewport(){
    const evaluated=
      await this.send(
        "Runtime.evaluate",
        {
          expression:
            `(()=>({
              width:Math.max(1,Math.round(window.innerWidth||document.documentElement.clientWidth||1440)),
              height:Math.max(1,Math.round(window.innerHeight||document.documentElement.clientHeight||900)),
              url:location.href,
              title:document.title||""
            }))()`,
          returnByValue:true
        }
      );

    return evaluated?.result?.value || {
      width:1440,
      height:900,
      url:this.currentUrl,
      title:this.currentTitle
    };
  }

  async captureConsoleFrame(){
    if(
      !this.ws ||
      this.ws.readyState!==WebSocket.OPEN
    ){
      throw new Error("Broker browser is not connected");
    }

    const viewport=
      await this.consoleViewport();

    const frame=
      await this.send(
        "Page.captureScreenshot",
        {
          format:"png",
          fromSurface:true,
          captureBeyondViewport:false
        }
      );

    return {
      success:true,
      connectionId:this.connectionId,
      imageData:clean(frame?.data),
      width:Number(viewport?.width||1440),
      height:Number(viewport?.height||900),
      currentUrl:clean(viewport?.url||this.currentUrl),
      currentTitle:clean(viewport?.title||this.currentTitle),
      loginDetected:this.loginDetected===true,
      tripsPageDetected:this.tripsPageDetected===true,
      consolePublicKey:CONSOLE_PUBLIC_KEY
    };
  }

  decryptConsoleText(cipherText){
    const encrypted=
      Buffer.from(
        clean(cipherText),
        "base64"
      );

    if(!encrypted.length){
      throw new Error("Encrypted console text is required");
    }

    return crypto.privateDecrypt(
      {
        key:CONSOLE_PRIVATE_KEY,
        padding:crypto.constants.RSA_PKCS1_OAEP_PADDING,
        oaepHash:"sha256"
      },
      encrypted
    )
    .toString("utf8")
    .slice(0,4000);
  }

  async blockedConsoleClick(x,y){
    const evaluated=
      await this.send(
        "Runtime.evaluate",
        {
          expression:
            `(()=>{
              const el=document.elementFromPoint(${Number(x)||0},${Number(y)||0});
              if(!el) return {blocked:false,text:""};
              const target=el.closest('button,a,[role="button"],input[type="button"],input[type="submit"]')||el;
              const text=String(
                target.innerText ||
                target.textContent ||
                target.value ||
                target.getAttribute?.("aria-label") ||
                target.getAttribute?.("title") ||
                ""
              ).replace(/\\s+/g," ").trim().slice(0,160);
              return {
                blocked:/\\b(accept|claim|take\\s+trip|take\\s+ride|book\\s+trip|reserve\\s+trip|assign)\\b/i.test(text),
                text
              };
            })()`,
          returnByValue:true
        }
      );

    return evaluated?.result?.value || {blocked:false,text:""};
  }

  async consoleAction(body={}){
    if(
      !this.ws ||
      this.ws.readyState!==WebSocket.OPEN
    ){
      throw new Error("Broker browser is not connected");
    }

    const action=
      clean(body.action)
        .toUpperCase();

    if(action==="SCREENSHOT"){
      return this.captureConsoleFrame();
    }

    if(action==="CLICK"){
      const viewport=
        await this.consoleViewport();

      const x=
        Math.max(
          0,
          Math.min(
            Number(viewport.width||1440)-1,
            Number(body.xRatio||0)*Number(viewport.width||1440)
          )
        );

      const y=
        Math.max(
          0,
          Math.min(
            Number(viewport.height||900)-1,
            Number(body.yRatio||0)*Number(viewport.height||900)
          )
        );

      const guard=
        await this.blockedConsoleClick(
          x,
          y
        );

      if(guard?.blocked){
        throw new Error(
          `Read-only mode blocked marketplace action: ${clean(guard.text)||"Accept/Claim"}`
        );
      }

      await this.send(
        "Input.dispatchMouseEvent",
        {
          type:"mousePressed",
          x,
          y,
          button:"left",
          clickCount:1
        }
      );

      await this.send(
        "Input.dispatchMouseEvent",
        {
          type:"mouseReleased",
          x,
          y,
          button:"left",
          clickCount:1
        }
      );

      await new Promise(resolve=>setTimeout(resolve,120));
      return this.captureConsoleFrame();
    }

    if(action==="TEXT"){
      const text=
        this.decryptConsoleText(
          body.encryptedText
        );

      await this.send(
        "Input.insertText",
        {
          text
        }
      );

      await new Promise(resolve=>setTimeout(resolve,80));
      return this.captureConsoleFrame();
    }

    if(action==="KEY"){
      const key=
        clean(body.key)
          .slice(0,40);

      const allowed=
        new Set([
          "Enter",
          "Tab",
          "Backspace",
          "Escape",
          "ArrowUp",
          "ArrowDown",
          "ArrowLeft",
          "ArrowRight"
        ]);

      if(!allowed.has(key)){
        throw new Error("Console key is not allowed");
      }

      const keyCodeMap={
        Enter:13,
        Tab:9,
        Backspace:8,
        Escape:27,
        ArrowUp:38,
        ArrowDown:40,
        ArrowLeft:37,
        ArrowRight:39
      };

      await this.send(
        "Input.dispatchKeyEvent",
        {
          type:"keyDown",
          key,
          windowsVirtualKeyCode:keyCodeMap[key]||0,
          nativeVirtualKeyCode:keyCodeMap[key]||0
        }
      );

      await this.send(
        "Input.dispatchKeyEvent",
        {
          type:"keyUp",
          key,
          windowsVirtualKeyCode:keyCodeMap[key]||0,
          nativeVirtualKeyCode:keyCodeMap[key]||0
        }
      );

      await new Promise(resolve=>setTimeout(resolve,100));
      return this.captureConsoleFrame();
    }

    if(action==="RELOAD"){
      await this.send(
        "Page.reload",
        {
          ignoreCache:false
        }
      );

      await new Promise(resolve=>setTimeout(resolve,500));
      return this.captureConsoleFrame();
    }

    throw new Error("Unsupported login console action");
  }

  status(){
    return {
      connectionId:
        this.connectionId,

      brokerName:
        this.brokerName,

      accountLabel:
        this.accountLabel,

      profilePersistent:true,

      loginConsoleReady:true,

      running:
        Boolean(
          this.browserProcess &&
          !this.browserProcess.killed
        ),

      browserFound:
        Boolean(
          this.browserPath
        ),

      debugAttached:
        this.debugAttached===true,

      currentUrl:
        this.currentUrl,

      currentTitle:
        this.currentTitle,

      loginDetected:
        this.loginDetected===true,

      tripsPageDetected:
        this.tripsPageDetected===true,

      startedAt:
        this.startedAt,

      lastDiscoveryAt:
        this.lastDiscoveryAt,

      lastDiscoveryType:
        this.lastDiscoveryType,

      discovered:
        this.discovered.size,

      networkCandidates:
        this.networkCandidates,

      domCandidates:
        this.domCandidates,

      discoveriesPosted:
        this.discoveriesPosted,

      mapperReady:
        this.lastMapperReady===true,

      mapperMethod:
        this.lastMapperMethod,

      actionDetected:
        this.lastActionDetected===true,

      actionConfidence:
        this.lastActionConfidence,

      lastError:
        this.lastError
    };
  }

  async stop(){
    if(this.stopping){
      return;
    }

    this.stopping=true;

    if(this.domTimer){
      clearInterval(
        this.domTimer
      );

      this.domTimer=null;
    }

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

    /*
      Deliberately keep this.profileDir on disk.
      Reusing it on the next start allows an already-authorized provider
      session to resume without forcing a fresh portal login every time.
    */
  }
}

function preflightCheck(body={}){
  const connectionId=
    clean(
      body.connectionId
    );

  const portalUrl=
    clean(
      body.portalUrl
    );

  const ghBaseUrl=
    clean(
      body.ghBaseUrl
    );

  const browserPath=
    findBrowser();

  const checks={
    controller:true,
    connectionId:Boolean(connectionId),
    browserFound:Boolean(browserPath),
    portalUrl:false,
    ghUrl:false
  };

  try{
    const portal=
      new URL(
        portalUrl
      );

    checks.portalUrl=
      ["http:","https:"]
        .includes(
          portal.protocol
        );
  }catch(_){}

  try{
    const gh=
      new URL(
        ghBaseUrl
      );

    checks.ghUrl=
      gh.protocol==="https:" ||
      [
        "localhost",
        "127.0.0.1"
      ].includes(
        gh.hostname
      );
  }catch(_){}

  const ready=
    checks.controller &&
    checks.connectionId &&
    checks.browserFound &&
    checks.portalUrl &&
    checks.ghUrl;

  return {
    success:ready,
    ready,
    checks,
    browserPath:
      browserPath ||
      "",
    message:
      ready
        ? "Local Browser Agent preflight passed"
        : "Local Browser Agent preflight failed"
  };
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
        requestUrl.pathname==="/preflight"
      ){
        try{
          const body=
            await readRequestBody(
              req
            );

          const result=
            preflightCheck(
              body
            );

          return json(
            res,
            result.ready ? 200 : 409,
            result,
            origin
          );

        }catch(err){
          return json(
            res,
            500,
            {
              success:false,
              ready:false,
              message:
                err.message ||
                String(err)
            },
            origin
          );
        }
      }

      if(
        req.method==="GET" &&
        requestUrl.pathname==="/status"
      ){
        const connectionId=
          clean(
            requestUrl
              .searchParams
              .get("connectionId")
          );

        const session=
          connectionId
            ? sessions.get(
                connectionId
              )
            : null;

        return json(
          res,
          200,
          {
            success:true,
            connectionId,
            session:
              session
                ? session.status()
                : null
          },
          origin
        );
      }


      if(
        req.method==="GET" &&
        requestUrl.pathname==="/console/frame"
      ){
        try{
          const connectionId=
            clean(
              requestUrl
                .searchParams
                .get("connectionId")
            );

          const session=
            sessions.get(
              connectionId
            );

          if(!session){
            return json(
              res,
              404,
              {
                success:false,
                message:"Broker browser session was not found"
              },
              origin
            );
          }

          const result=
            await session.captureConsoleFrame();

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
              message:err.message||String(err)
            },
            origin
          );
        }
      }

      if(
        req.method==="POST" &&
        requestUrl.pathname==="/console/action"
      ){
        try{
          const body=
            await readRequestBody(
              req
            );

          const connectionId=
            clean(
              body.connectionId
            );

          const session=
            sessions.get(
              connectionId
            );

          if(!session){
            return json(
              res,
              404,
              {
                success:false,
                message:"Broker browser session was not found"
              },
              origin
            );
          }

          const result=
            await session.consoleAction(
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
            400,
            {
              success:false,
              message:err.message||String(err)
            },
            origin
          );
        }
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
