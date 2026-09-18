"use strict";

const API_URL = "/api/tax-report";

function staffValue(sessionKey,legacyKey){
  return String(
    sessionStorage.getItem(sessionKey) ||
    localStorage.getItem(legacyKey) ||
    ""
  ).trim();
}

const token =
  staffValue("staffToken","token");

const role =
  staffValue("staffRole","role")
    .toUpperCase()
    .replace(/[\s-]+/g,"_");

if(
  !token ||
  !["SUPER_ADMIN","SUPERADMIN"].includes(role)
){
  window.location.replace("/login.html");
}

const fromDate =
  document.getElementById("fromDate");

const toDate =
  document.getElementById("toDate");

const statusMessage =
  document.getElementById("statusMessage");

let currentReport = null;


const immediateCompanyName =
  String(
    sessionStorage.getItem("companyName") ||
    localStorage.getItem("companyName") ||
    sessionStorage.getItem("tenantName") ||
    localStorage.getItem("tenantName") ||
    ""
  ).trim();

if(immediateCompanyName){
  setText("reportCompanyName",immediateCompanyName);
}


let brokerFeatureEnabled = false;

let brokerReport = {
  paidTrips:0,
  amount:0,
  miles:0,
  brokersCount:0,
  brokers:[],
  byBroker:[],
  items:[]
};

function money(value){
  return new Intl.NumberFormat(
    "en-US",
    {
      style:"currency",
      currency:"USD"
    }
  ).format(Number(value || 0));
}

function number(value,digits=0){
  return Number(value || 0)
    .toLocaleString(
      "en-US",
      {
        minimumFractionDigits:digits,
        maximumFractionDigits:digits
      }
    );
}

function isoDate(date){
  return date.toISOString().slice(0,10);
}

function setDefaultDates(){
  const now = new Date();
  const start =
    new Date(
      now.getFullYear(),
      0,
      1
    );

  fromDate.value =
    isoDate(start);

  toDate.value =
    isoDate(now);
}

function showStatus(message,type="ok"){
  statusMessage.textContent =
    message;

  statusMessage.className =
    "status-message show " + type;
}

function clearStatus(){
  statusMessage.className =
    "status-message";
  statusMessage.textContent = "";
}

function setText(id,value){
  const el =
    document.getElementById(id);

  if(el){
    el.textContent = value;
  }
}

function renderCompanies(rows){

  const body =
    document.getElementById(
      "companyTableBody"
    );

  if(!rows.length){
    body.innerHTML =
      `<tr><td colspan="4" class="empty">No company payments in this period.</td></tr>`;
    return;
  }

  body.innerHTML =
    rows.map(row=>`
      <tr>
        <td class="company-cell">${escapeHtml(row.companyName || "Company")}</td>
        <td>${number(row.paymentCount)}</td>
        <td>${money(row.paidAmount)}</td>
        <td>${number(row.tripCount)}</td>
      </tr>
    `).join("");
}

function escapeHtml(value){
  return String(value ?? "")
    .replace(/&/g,"&amp;")
    .replace(/</g,"&lt;")
    .replace(/>/g,"&gt;")
    .replace(/"/g,"&quot;")
    .replace(/'/g,"&#039;");
}

function setBrokerVisibility(visible){
  brokerFeatureEnabled =
    visible === true;

  document
    .querySelectorAll(".broker-dynamic")
    .forEach(el=>{
      el.classList.toggle(
        "hidden",
        !brokerFeatureEnabled
      );
    });

  document
    .querySelector(".summary-grid")
    ?.classList.toggle(
      "no-broker",
      !brokerFeatureEnabled
    );
}

async function loadBrokerCapability(){
  try{
    const res =
      await fetch(
        "/api/shared-engine/settings",
        {
          headers:{
            Authorization:
              "Bearer " + token
          },
          cache:"no-store"
        }
      );

    const data =
      await res.json()
        .catch(()=>({}));

    const enabled =
      res.ok &&
      data?.capabilities
        ?.brokerContractEnabled === true;

    setBrokerVisibility(enabled);

    return enabled;

  }catch(err){
    console.log(
      "TAX BROKER CAPABILITY ERROR:",
      err
    );

    setBrokerVisibility(false);
    return false;
  }
}

function buildBrokerBreakdown(items,brokers){
  const map =
    new Map();

  (Array.isArray(brokers) ? brokers : [])
    .forEach(broker=>{
      const code =
        String(
          broker?.code || ""
        ).trim();

      const name =
        String(
          broker?.name ||
          code ||
          "Broker"
        ).trim();

      if(!code && !name){
        return;
      }

      const key =
        code || name;

      map.set(key,{
        code,
        name,
        trips:0,
        amount:0,
        miles:0
      });
    });

  (Array.isArray(items) ? items : [])
    .forEach(item=>{
      const code =
        String(
          item?.brokerCode || ""
        ).trim();

      const name =
        String(
          item?.brokerName ||
          code ||
          "Broker"
        ).trim();

      const key =
        code || name;

      if(!map.has(key)){
        map.set(key,{
          code,
          name,
          trips:0,
          amount:0,
          miles:0
        });
      }

      const row =
        map.get(key);

      row.trips += 1;
      row.amount +=
        Number(
          item?.total || 0
        );
      row.miles +=
        Number(
          item?.miles || 0
        );
    });

  return [...map.values()]
    .filter(row=>
      row.trips > 0 ||
      row.amount > 0 ||
      row.miles > 0
    )
    .sort((a,b)=>
      a.name.localeCompare(b.name)
    );
}

function renderBrokers(rows){
  const body =
    document.getElementById(
      "brokerTableBody"
    );

  if(!body){
    return;
  }

  if(!rows.length){
    body.innerHTML =
      `<tr><td colspan="4" class="empty">No broker activity in this period.</td></tr>`;

    setText(
      "brokerTableTripTotal",
      "0"
    );
    setText(
      "brokerTableAmountTotal",
      money(0)
    );
    setText(
      "brokerTableMilesTotal",
      number(0,1)
    );

    return;
  }

  body.innerHTML =
    rows.map(row=>`
      <tr>
        <td class="company-cell">${escapeHtml(row.name || row.code || "Broker")}</td>
        <td>${number(row.trips)}</td>
        <td>${money(row.amount)}</td>
        <td>${number(row.miles,1)}</td>
      </tr>
    `).join("");

  setText(
    "brokerTableTripTotal",
    number(
      rows.reduce(
        (sum,row)=>
          sum +
          Number(row.trips || 0),
        0
      )
    )
  );

  setText(
    "brokerTableAmountTotal",
    money(
      rows.reduce(
        (sum,row)=>
          sum +
          Number(row.amount || 0),
        0
      )
    )
  );

  setText(
    "brokerTableMilesTotal",
    number(
      rows.reduce(
        (sum,row)=>
          sum +
          Number(row.miles || 0),
        0
      ),
      1
    )
  );
}

async function loadBrokerReport(from,to){
  if(brokerFeatureEnabled !== true){
    brokerReport = {
      paidTrips:0,
      amount:0,
      miles:0,
      brokersCount:0,
      brokers:[],
      byBroker:[],
      items:[]
    };

    return brokerReport;
  }

  const params =
    new URLSearchParams();

  if(from){
    params.set("from",from);
  }

  if(to){
    params.set("to",to);
  }

  const res =
    await fetch(
      "/api/external-summary?" +
      params.toString(),
      {
        headers:{
          Authorization:
            "Bearer " + token
        },
        cache:"no-store"
      }
    );

  const data =
    await res.json()
      .catch(()=>({}));

  if(
    !res.ok ||
    data.success === false
  ){
    throw new Error(
      data.message ||
      "Failed to load broker tax data"
    );
  }

  const items =
    Array.isArray(data.items)
      ? data.items
      : [];

  const brokers =
    Array.isArray(data.brokers)
      ? data.brokers
      : [];

  const byBroker =
    buildBrokerBreakdown(
      items,
      brokers
    );

  brokerReport = {
    paidTrips:
      items.length,

    amount:
      items.reduce(
        (sum,item)=>
          sum +
          Number(item?.total || 0),
        0
      ),

    miles:
      items.reduce(
        (sum,item)=>
          sum +
          Number(item?.miles || 0),
        0
      ),

    brokersCount:
      byBroker.length,

    brokers,
    byBroker,
    items
  };

  return brokerReport;
}

function render(report){

  currentReport = report;

  setText(
    "reportCompanyName",
    report.companyName ||
    localStorage.getItem("companyName") ||
    "Company"
  );

  setText(
    "periodText",
    `${report.period.from} - ${report.period.to}`
  );

  setText(
    "generatedText",
    new Date(
      report.generatedAt
    ).toLocaleString("en-US")
  );

  setText(
    "companiesCount",
    number(report.summary.companiesCount)
  );

  setText(
    "companyPayments",
    money(report.summary.companyPayments)
  );

  setText(
    "getQuotePayments",
    money(report.summary.getQuotePayments)
  );

  setText(
    "reservedPayments",
    money(report.summary.reservedPayments)
  );

  const brokerAmount =
    brokerFeatureEnabled
      ? Number(brokerReport.amount || 0)
      : 0;

  const brokerMilesValue =
    brokerFeatureEnabled
      ? Number(brokerReport.miles || 0)
      : 0;

  const brokerTripsValue =
    brokerFeatureEnabled
      ? Number(brokerReport.paidTrips || 0)
      : 0;

  setText(
    "brokersCount",
    number(
      brokerFeatureEnabled
        ? Number(
            brokerReport.brokersCount || 0
          )
        : 0
    )
  );

  setText(
    "brokerPayments",
    money(brokerAmount)
  );

  renderBrokers(
    brokerFeatureEnabled
      ? (
          Array.isArray(
            brokerReport.byBroker
          )
            ? brokerReport.byBroker
            : []
        )
      : []
  );

  setText(
    "totalAmount",
    money(
      Number(report.summary.totalAmount || 0) +
      brokerAmount
    )
  );

  setText(
    "totalMiles",
    number(
      Number(report.summary.totalMiles || 0) +
      brokerMilesValue,
      1
    )
  );

  renderCompanies(
    report.companies || []
  );

  setText(
    "tablePaymentCount",
    number(report.summary.companyPaymentCount)
  );

  setText(
    "tableCompanyTotal",
    money(report.summary.companyPayments)
  );

  setText(
    "tableTripCount",
    number(report.summary.companyTrips)
  );

  setText(
    "getQuoteTrips",
    number(report.getQuote.paidTrips)
  );

  setText(
    "getQuoteTableAmount",
    money(report.getQuote.amount)
  );

  setText(
    "getQuoteMiles",
    number(report.getQuote.miles,1)
  );

  setText(
    "reservedTrips",
    number(report.reserved.paidTrips)
  );

  setText(
    "reservedTableAmount",
    money(report.reserved.amount)
  );

  setText(
    "reservedMiles",
    number(report.reserved.miles,1)
  );

  setText(
    "brokerTrips",
    number(brokerTripsValue)
  );

  setText(
    "brokerTableAmount",
    money(brokerAmount)
  );

  setText(
    "brokerMiles",
    number(brokerMilesValue,1)
  );

  setText(
    "paidTripsTotal",
    number(
      Number(report.getQuote.paidTrips || 0) +
      Number(report.reserved.paidTrips || 0) +
      brokerTripsValue
    )
  );

  setText(
    "directPaymentsTotal",
    money(
      Number(report.getQuote.amount || 0) +
      Number(report.reserved.amount || 0) +
      brokerAmount
    )
  );

  setText(
    "directMilesTotal",
    number(
      Number(report.getQuote.miles || 0) +
      Number(report.reserved.miles || 0) +
      brokerMilesValue,
      1
    )
  );

  currentReport = {
    ...report,
    broker:{
      paidTrips:brokerTripsValue,
      amount:brokerAmount,
      miles:brokerMilesValue,
      brokersCount:
        Number(
          brokerReport.brokersCount || 0
        ),
      byBroker:
        Array.isArray(
          brokerReport.byBroker
        )
          ? brokerReport.byBroker
          : []
    },
    summary:{
      ...report.summary,
      brokerPayments:brokerAmount,
      brokerTrips:brokerTripsValue,
      brokerMiles:brokerMilesValue,
      totalAmount:
        Number(report.summary.totalAmount || 0) +
        brokerAmount,
      totalMiles:
        Number(report.summary.totalMiles || 0) +
        brokerMilesValue
    }
  };
}

async function loadReport(){

  clearStatus();

  const from =
    fromDate.value;

  const to =
    toDate.value;

  if(!from || !to){
    showStatus(
      "Select From and To dates.",
      "error"
    );
    return;
  }

  if(from > to){
    showStatus(
      "From date cannot be after To date.",
      "error"
    );
    return;
  }

  const button =
    document.getElementById("loadBtn");

  button.disabled = true;
  button.textContent = "Loading...";

  try{

    const res =
      await fetch(
        `${API_URL}?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`,
        {
          headers:{
            Authorization:
              "Bearer " + token
          },
          cache:"no-store"
        }
      );

    const data =
      await res.json()
        .catch(()=>({}));

    if(
      !res.ok ||
      data.success === false
    ){
      throw new Error(
        data.message ||
        "Failed to load tax report"
      );
    }

    render(data);

    if(brokerFeatureEnabled === true){
      loadBrokerReport(
        from,
        to
      )
        .then(()=>{
          if(currentReport){
            render(currentReport);
          }
        })
        .catch(err=>{
          console.log(
            "TAX BROKER LOAD ERROR:",
            err
          );
        });
    }

  }catch(err){

    console.error(err);

    showStatus(
      err.message ||
      "Failed to load tax report",
      "error"
    );

  }finally{

    button.disabled = false;
    button.textContent = "Apply";
  }
}

function downloadFile(
  filename,
  content,
  type
){
  const blob =
    new Blob(
      [content],
      {type}
    );

  const url =
    URL.createObjectURL(blob);

  const a =
    document.createElement("a");

  a.href = url;
  a.download = filename;

  document.body.appendChild(a);
  a.click();
  a.remove();

  URL.revokeObjectURL(url);
}

function saveReport(){

  if(!currentReport){
    showStatus(
      "Load the report first.",
      "error"
    );
    return;
  }

  const name =
    `tax-report-${currentReport.period.from}-to-${currentReport.period.to}.json`;

  downloadFile(
    name,
    JSON.stringify(
      currentReport,
      null,
      2
    ),
    "application/json;charset=utf-8"
  );

  showStatus(
    "Report saved.",
    "ok"
  );
}

function csvCell(value){
  const text =
    String(value ?? "");

  return `"${text.replace(/"/g,'""')}"`;
}

function exportExcel(){

  if(!currentReport){
    showStatus(
      "Load the report first.",
      "error"
    );
    return;
  }

  const rows = [];

  rows.push([
    "GH Mobility Tax Report"
  ]);

  rows.push([
    "Company",
    currentReport.companyName
  ]);

  rows.push([
    "From",
    currentReport.period.from,
    "To",
    currentReport.period.to
  ]);

  rows.push([]);

  rows.push([
    "Companies",
    currentReport.summary.companiesCount
  ]);

  rows.push([
    "Company Payments",
    currentReport.summary.companyPayments
  ]);

  rows.push([
    "Get Quote Payments",
    currentReport.summary.getQuotePayments
  ]);

  rows.push([
    "Reserved Payments",
    currentReport.summary.reservedPayments
  ]);

  if(brokerFeatureEnabled){
    rows.push([
      "Brokers",
      currentReport.broker?.brokersCount || 0
    ]);

    rows.push([
      "Broker Payments",
      currentReport.summary.brokerPayments || 0
    ]);
  }

  rows.push([
    "Total Amount",
    currentReport.summary.totalAmount
  ]);

  rows.push([
    "Total Miles",
    currentReport.summary.totalMiles
  ]);

  rows.push([]);
  rows.push([
    "Company",
    "Payments",
    "Paid Amount",
    "Trips"
  ]);

  (currentReport.companies || [])
    .forEach(row=>{
      rows.push([
        row.companyName,
        row.paymentCount,
        row.paidAmount,
        row.tripCount
      ]);
    });

  if(
    brokerFeatureEnabled &&
    Array.isArray(
      currentReport.broker?.byBroker
    )
  ){
    rows.push([]);
    rows.push([
      "Broker",
      "Trips",
      "Amount",
      "Miles"
    ]);

    currentReport.broker.byBroker
      .forEach(row=>{
        rows.push([
          row.name || row.code || "Broker",
          row.trips || 0,
          row.amount || 0,
          row.miles || 0
        ]);
      });
  }

  rows.push([]);
  rows.push([
    "Payment Source",
    "Paid Trips",
    "Amount",
    "Miles"
  ]);

  rows.push([
    "Get Quote",
    currentReport.getQuote.paidTrips,
    currentReport.getQuote.amount,
    currentReport.getQuote.miles
  ]);

  rows.push([
    "Reserved",
    currentReport.reserved.paidTrips,
    currentReport.reserved.amount,
    currentReport.reserved.miles
  ]);

  if(brokerFeatureEnabled){
    rows.push([
      "Broker",
      currentReport.broker?.paidTrips || 0,
      currentReport.broker?.amount || 0,
      currentReport.broker?.miles || 0
    ]);
  }

  const csv =
    "\ufeff" +
    rows
      .map(row=>
        row.map(csvCell).join(",")
      )
      .join("\r\n");

  const name =
    `tax-report-${currentReport.period.from}-to-${currentReport.period.to}.csv`;

  downloadFile(
    name,
    csv,
    "text/csv;charset=utf-8"
  );
}

document
  .getElementById("loadBtn")
  .addEventListener(
    "click",
    loadReport
  );

document
  .getElementById("printBtn")
  .addEventListener(
    "click",
    ()=>window.print()
  );

document
  .getElementById("saveBtn")
  .addEventListener(
    "click",
    saveReport
  );

document
  .getElementById("excelBtn")
  .addEventListener(
    "click",
    exportExcel
  );

setDefaultDates();

(async()=>{
  const brokerCapabilityPromise =
    loadBrokerCapability();

  const from =
    fromDate.value;

  const to =
    toDate.value;

  const taxRequest =
    fetch(
      `${API_URL}?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`,
      {
        headers:{
          Authorization:
            "Bearer " + token
        },
        cache:"no-store"
      }
    );

  try{
    const res = await taxRequest;

    const data =
      await res.json()
        .catch(()=>({}));

    if(
      !res.ok ||
      data.success === false
    ){
      throw new Error(
        data.message ||
        "Failed to load tax report"
      );
    }

    render(data);

  }catch(err){
    console.error(err);
    showStatus(
      err.message ||
      "Failed to load tax report",
      "error"
    );
  }

  try{
    const brokerEnabled =
      await brokerCapabilityPromise;

    if(brokerEnabled === true){
      await loadBrokerReport(
        from,
        to
      );

      if(currentReport){
        render(currentReport);
      }
    }
  }catch(err){
    console.log(
      "TAX BROKER STARTUP ERROR:",
      err
    );
  }
})();
