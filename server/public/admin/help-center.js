"use strict";

const HelpCenter = (()=>{

  const state = {
    index:null,
    articles:[],
    role:"ADMIN",
    brokerEnabled:false,
    sharedEnabled:false,
    module:"",
    page:"",
    currentSourcePage:""
  };

  const $ = id=>document.getElementById(id);

  function clean(value){
    return String(value ?? "").trim();
  }

  function upper(value){
    return clean(value).toUpperCase();
  }

  function staffValue(sessionKey,legacyKey){
    return (
      sessionStorage.getItem(sessionKey) ||
      localStorage.getItem(legacyKey) ||
      ""
    );
  }

  function currentRole(){
    const raw =
      upper(
        staffValue(
          "staffRole",
          "role"
        )
      );

    if(
      raw === "SUPER_ADMIN" ||
      raw === "SUPERADMIN"
    ){
      return "SUPER_ADMIN";
    }

    if(raw === "DISPATCHER"){
      return "DISPATCHER";
    }

    return "ADMIN";
  }

  function authHeaders(){
    const token =
      staffValue(
        "staffToken",
        "token"
      );

    return token
      ? {Authorization:"Bearer " + token}
      : {};
  }

  function sourcePageFromReferrer(){
    try{
      const url =
        new URL(
          document.referrer
        );

      if(
        url.origin !==
        location.origin
      ){
        return "";
      }

      const file =
        clean(
          url.pathname
            .split("/")
            .pop()
        )
        .toLowerCase();

      return (
        file &&
        file !== "help-center.html"
      )
        ? file
        : "";

    }catch(err){
      return "";
    }
  }

  async function loadCapabilities(){

    try{

      const response =
        await fetch(
          "/api/shared-engine/settings",
          {
            cache:"no-store",
            headers:authHeaders()
          }
        );

      if(!response.ok){
        return;
      }

      const data =
        await response
          .json()
          .catch(()=>({}));

      const cap =
        data?.capabilities || {};

      state.sharedEnabled =
        cap.sharedServiceEnabled === true ||
        cap.sharedServiceFound === true;

      state.brokerEnabled =
        cap.brokerContractEnabled === true;

    }catch(err){
      console.log(
        "HELP CAPABILITY LOAD ERROR:",
        err?.message || err
      );
    }
  }

  function featureAllowed(feature){

    const key =
      upper(feature);

    if(!key){
      return true;
    }

    if(key === "BROKER"){
      return state.brokerEnabled;
    }

    if(key === "SHARED"){
      return state.sharedEnabled;
    }

    return true;
  }

  function roleAllowed(article){

    if(
      state.role ===
      "SUPER_ADMIN"
    ){
      return true;
    }

    const roles =
      Array.isArray(article?.roles)
        ? article.roles.map(upper)
        : [];

    return roles.includes(
      state.role
    );
  }

  async function loadKnowledge(){

    const indexRes =
      await fetch(
        "/admin/help-data/help-index.json",
        {cache:"no-store"}
      );

    if(!indexRes.ok){
      throw new Error(
        "Help index could not be loaded."
      );
    }

    state.index =
      await indexRes.json();

    const pages =
      Array.isArray(
        state.index?.pages
      )
        ? state.index.pages
        : [];

    const docs =
      await Promise.all(
        pages.map(
          async page=>{

            const res =
              await fetch(
                "/admin/" +
                page.dataFile,
                {cache:"no-store"}
              );

            if(!res.ok){
              return null;
            }

            return await res
              .json()
              .catch(()=>null);
          }
        )
      );

    state.articles =
      docs
        .filter(Boolean)
        .flatMap(doc=>
          Array.isArray(doc.articles)
            ? doc.articles
            : []
        );
  }

  function accessibleArticles(){
    return state.articles
      .filter(article=>
        article?.active !== false &&
        roleAllowed(article) &&
        featureAllowed(
          article?.requiredFeature
        )
      );
  }

  function normalizeSearch(value){
    return clean(value)
      .toLowerCase()
      .replace(/[_-]/g," ")
      .replace(/\s+/g," ");
  }

  function articleText(article){
    return normalizeSearch([
      article?.title,
      article?.summary,
      article?.pageTitle,
      article?.pageFile,
      article?.module,
      ...(article?.keywords || []),
      ...(article?.steps || []),
      ...(article?.warnings || [])
    ].join(" "));
  }

  function searchScore(
    article,
    query
  ){

    const q =
      normalizeSearch(query);

    if(!q){
      let base = 1;

      if(
        state.currentSourcePage &&
        article.pageFile ===
          state.currentSourcePage
      ){
        base += 30;
      }

      return base;
    }

    const words =
      q.split(" ")
        .filter(Boolean);

    const title =
      normalizeSearch(
        article.title
      );

    const keywords =
      normalizeSearch(
        (article.keywords || [])
          .join(" ")
      );

    const text =
      articleText(article);

    let score = 0;

    if(title === q){
      score += 100;
    }

    if(title.includes(q)){
      score += 55;
    }

    if(keywords.includes(q)){
      score += 45;
    }

    for(const word of words){

      if(title.includes(word)){
        score += 15;
      }

      if(keywords.includes(word)){
        score += 10;
      }

      if(text.includes(word)){
        score += 3;
      }
    }

    if(
      state.currentSourcePage &&
      article.pageFile ===
        state.currentSourcePage
    ){
      score += 25;
    }

    return score;
  }

  function visibleResults(){

    const query =
      $("helpSearch")?.value || "";

    const page =
      $("helpPageFilter")?.value || "";

    return accessibleArticles()
      .filter(article=>
        !state.module ||
        article.module === state.module
      )
      .filter(article=>
        !page ||
        article.pageFile === page
      )
      .map(article=>({
        article,
        score:
          searchScore(
            article,
            query
          )
      }))
      .filter(item=>
        !normalizeSearch(query) ||
        item.score > 0
      )
      .sort((a,b)=>
        b.score - a.score ||
        a.article.pageId
          .localeCompare(
            b.article.pageId
          ) ||
        a.article.id
          .localeCompare(
            b.article.id
          )
      )
      .slice(0,80)
      .map(item=>item.article);
  }

  function escapeHtml(value){
    return String(value ?? "")
      .replace(/&/g,"&amp;")
      .replace(/</g,"&lt;")
      .replace(/>/g,"&gt;")
      .replace(/"/g,"&quot;")
      .replace(/'/g,"&#39;");
  }

  function renderModules(){

    const host =
      $("helpModules");

    if(!host){
      return;
    }

    const articles =
      accessibleArticles();

    const modules =
      [...new Set(
        articles.map(a=>a.module)
      )]
      .filter(Boolean)
      .sort();

    host.innerHTML = "";

    const allBtn =
      document.createElement(
        "button"
      );

    allBtn.type = "button";
    allBtn.className =
      "help-module-btn" +
      (!state.module
        ? " active"
        : "");

    allBtn.textContent =
      `All Modules (${articles.length})`;

    allBtn.addEventListener(
      "click",
      ()=>{
        state.module = "";
        renderModules();
        renderResults();
      }
    );

    host.appendChild(allBtn);

    for(const moduleName of modules){

      const count =
        articles.filter(
          a=>a.module === moduleName
        ).length;

      const btn =
        document.createElement(
          "button"
        );

      btn.type = "button";
      btn.className =
        "help-module-btn" +
        (
          state.module ===
          moduleName
            ? " active"
            : ""
        );

      btn.textContent =
        `${moduleName} (${count})`;

      btn.addEventListener(
        "click",
        ()=>{
          state.module =
            moduleName;

          renderModules();
          renderResults();
        }
      );

      host.appendChild(btn);
    }
  }

  function renderPageFilter(){

    const select =
      $("helpPageFilter");

    if(!select){
      return;
    }

    const current =
      select.value;

    const pages =
      [...new Map(
        accessibleArticles()
          .map(article=>[
            article.pageFile,
            {
              file:article.pageFile,
              id:article.pageId,
              title:article.pageTitle
            }
          ])
      ).values()]
      .sort(
        (a,b)=>
          a.id.localeCompare(b.id)
      );

    select.innerHTML =
      `<option value="">All accessible pages</option>`;

    for(const page of pages){

      const option =
        document.createElement(
          "option"
        );

      option.value =
        page.file;

      option.textContent =
        `${page.id} — ${page.title}`;

      select.appendChild(
        option
      );
    }

    if(
      current &&
      pages.some(
        p=>p.file === current
      )
    ){
      select.value =
        current;
    }
  }

  function renderResults(){

    const host =
      $("helpResults");

    const countEl =
      $("helpResultCount");

    if(!host || !countEl){
      return;
    }

    const results =
      visibleResults();

    const query =
      clean(
        $("helpSearch")?.value
      );

    countEl.textContent =
      `${results.length} result${results.length === 1 ? "" : "s"}` +
      (
        query
          ? ` for "${query}"`
          : ""
      );

    if(!results.length){

      host.innerHTML = `
        <div class="help-empty">
          No matching help article is available for your role and enabled modules.
        </div>
      `;

      return;
    }

    host.innerHTML =
      results
        .map(article=>{

          const warning =
            Array.isArray(
              article.warnings
            ) &&
            article.warnings.length
              ? `
                <div class="help-warning">
                  ${article.warnings
                    .map(w=>`<div>${escapeHtml(w)}</div>`)
                    .join("")}
                </div>
              `
              : "";

          return `
            <article class="help-result" data-help-id="${escapeHtml(article.id)}">
              <button class="help-result-head" type="button">
                <div>
                  <div class="help-result-title">${escapeHtml(article.title)}</div>
                  <div class="help-result-meta">
                    ${escapeHtml(article.pageId)} ·
                    ${escapeHtml(article.pageTitle)} ·
                    ${escapeHtml(article.module)}
                  </div>
                  <div class="help-result-summary">${escapeHtml(article.summary)}</div>
                </div>
                <span class="help-chevron">⌄</span>
              </button>
              <div class="help-result-body">
                <ol class="help-steps">
                  ${(article.steps || [])
                    .map(step=>`<li>${escapeHtml(step)}</li>`)
                    .join("")}
                </ol>
                ${warning}
                <div class="help-source">
                  Page: ${escapeHtml(article.pageFile)}
                </div>
              </div>
            </article>
          `;
        })
        .join("");

    host
      .querySelectorAll(
        ".help-result-head"
      )
      .forEach(button=>{

        button.addEventListener(
          "click",
          ()=>{

            button
              .closest(
                ".help-result"
              )
              ?.classList
              .toggle("open");
          }
        );
      });
  }

  function renderMeta(){

    const roleChip =
      $("helpRoleChip");

    const contextChip =
      $("helpContextChip");

    const featureChip =
      $("helpFeatureChip");

    if(roleChip){
      roleChip.textContent =
        "Role: " +
        state.role
          .replace("_"," ");
    }

    if(contextChip){

      const page =
        state.index?.pages
          ?.find(
            p=>
              p.pageFile ===
              state.currentSourcePage
          );

      contextChip.textContent =
        page
          ? `Context: ${page.pageId} — ${page.pageTitle}`
          : "Context: All pages";
    }

    if(featureChip){

      const enabled = ["Core"];

      if(state.sharedEnabled){
        enabled.push("Shared");
      }

      if(state.brokerEnabled){
        enabled.push("Broker");
      }

      featureChip.textContent =
        "Features: " +
        enabled.join(", ");
    }
  }

  function bind(){

    $("helpSearch")
      ?.addEventListener(
        "input",
        renderResults
      );

    $("helpPageFilter")
      ?.addEventListener(
        "change",
        renderResults
      );
  }

  async function init(){

    try{

      state.role =
        currentRole();

      state.currentSourcePage =
        sourcePageFromReferrer();

      await Promise.all([
        loadCapabilities(),
        loadKnowledge()
      ]);

      renderMeta();
      renderPageFilter();
      renderModules();
      bind();
      renderResults();

    }catch(err){

      console.log(
        "HELP CENTER ERROR:",
        err
      );

      if($("helpResultCount")){
        $("helpResultCount")
          .textContent =
          "Help Center failed to load.";
      }

      if($("helpResults")){
        $("helpResults")
          .innerHTML =
          `<div class="help-empty">${escapeHtml(err.message || "Unable to load Help Center.")}</div>`;
      }
    }
  }

  return {init};

})();

HelpCenter.init();
