/* =========================================================
   FILE: public/admin/payroll-summary.js

   COMPANY PAYROLL SUMMARY
   ALL WORKER TYPES
   ROLLING LAST 24 MONTHS
========================================================= */

const token =
  String(
    localStorage.getItem("token") ||
    ""
  );

const role =
  String(
    localStorage.getItem("role") ||
    ""
  )
  .trim()
  .toUpperCase()
  .replace(/[\s-]+/g,"_");

if(
  !token ||
  ![
    "SUPER_ADMIN",
    "SUPERADMIN"
  ].includes(role)
){
  window.location.href =
    "dashboard.html";
}

let currentType =
  "all";


/* =========================
   HELPERS
========================= */

function hoursText(value){

  const minutes =
    Math.round(
      Number(value || 0) * 60
    );

  const h =
    Math.floor(
      minutes / 60
    );

  const m =
    minutes % 60;

  return (
    `${h} H ` +
    `${String(m).padStart(2,"0")} MIN`
  );
}

function money(value){

  return new Intl.NumberFormat(
    "en-US",
    {
      style:"currency",
      currency:"USD"
    }
  ).format(
    Number(value || 0)
  );
}

function dateText(key){

  const [
    y,
    m,
    d
  ] =
    String(key || "")
      .split("-")
      .map(Number);

  if(!y || !m || !d){
    return "-";
  }

  return new Date(
    Date.UTC(
      y,
      m - 1,
      d,
      12
    )
  )
  .toLocaleDateString(
    "en-US",
    {
      month:"short",
      day:"numeric",
      year:"numeric",
      timeZone:"UTC"
    }
  );
}

function escapeHtml(value){

  return String(value ?? "")
    .replaceAll("&","&amp;")
    .replaceAll("<","&lt;")
    .replaceAll(">","&gt;")
    .replaceAll('"',"&quot;")
    .replaceAll("'","&#039;");
}


/* =========================
   LOAD
========================= */

async function loadSummary(){

  const body =
    document.getElementById(
      "summaryBody"
    );

  body.innerHTML = `
    <tr>
      <td colspan="6">
        Loading...
      </td>
    </tr>
  `;

  try{

    const query =
      new URLSearchParams({
        type:currentType
      });

    const response =
      await fetch(
        `/api/payroll/admin-summary?${query.toString()}`,
        {
          headers:{
            Authorization:
              `Bearer ${token}`
          },

          cache:"no-store"
        }
      );

    const data =
      await response
        .json()
        .catch(
          ()=>({})
        );

    if(!response.ok){

      throw new Error(
        data.message ||
        "Unable to load payroll summary."
      );
    }

    const totals =
      data.totals ||
      {};

    document.getElementById(
      "totalWorkers"
    ).textContent =
      String(
        Number(
          totals.totalWorkers ||
          0
        )
      );

    document.getElementById(
      "totalHours"
    ).textContent =
      hoursText(
        totals.totalHours
      );

    document.getElementById(
      "totalTrips"
    ).textContent =
      String(
        Number(
          totals.totalTrips ||
          0
        )
      );

    document.getElementById(
      "totalEarnings"
    ).textContent =
      money(
        totals.totalEarnings
      );

    const periods =
      Array.isArray(
        data.periods
      )
        ? data.periods
        : [];

    if(!periods.length){

      body.innerHTML = `
        <tr>
          <td colspan="6">
            No closed payroll periods yet.
          </td>
        </tr>
      `;

      return;
    }

    body.innerHTML =
      periods
        .map(
          row=>`
            <tr>

              <td>
                ${escapeHtml(dateText(row.from))}
              </td>

              <td>
                ${escapeHtml(dateText(row.to))}
              </td>

              <td>
                ${Number(row.workers || 0)}
              </td>

              <td>
                ${escapeHtml(hoursText(row.totalHours))}
              </td>

              <td>
                ${Number(row.totalTrips || 0)}
              </td>

              <td class="money">
                ${escapeHtml(money(row.totalEarnings))}
              </td>

            </tr>
          `
        )
        .join("");

  }catch(error){

    console.error(
      "ADMIN PAYROLL SUMMARY ERROR:",
      error
    );

    body.innerHTML = `
      <tr>
        <td colspan="6">
          ${escapeHtml(error.message)}
        </td>
      </tr>
    `;
  }
}


/* =========================
   TABS
========================= */

document
  .querySelectorAll(
    ".tab-btn"
  )
  .forEach(
    button=>{

      button.addEventListener(
        "click",
        ()=>{

          document
            .querySelectorAll(
              ".tab-btn"
            )
            .forEach(
              tab=>
                tab.classList.remove(
                  "active"
                )
            );

          button.classList.add(
            "active"
          );

          currentType =
            String(
              button.dataset.type ||
              "all"
            );

          loadSummary();
        }
      );
    }
  );


/* =========================
   START
========================= */

loadSummary();