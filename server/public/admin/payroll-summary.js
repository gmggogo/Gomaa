/* =========================================================
   FILE: public/admin/payroll-summary.js
   SUPER ADMIN PAYROLL HISTORY — ROLLING 24 MONTHS
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

async function load(){

  const body =
    document.getElementById(
      "summaryBody"
    );

  try{

    const response =
      await fetch(
        "/api/payroll/admin-summary",
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

load();