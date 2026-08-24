/* =========================================================
   FILE: public/admin/payroll-summary.js

   MASTER / DETAIL PAYROLL SUMMARY

   LEFT:
   - Names
   - Search
   - Last closed pay period only

   RIGHT:
   - Selected person's full payroll history
   - Rolling last 24 months

   Groups:
   Drivers / Dispatchers / Admins / Super Admins
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
  "driver";

let people =
  [];

let selectedPersonId =
  "";

let searchText =
  "";

let currentPage =
  1;

const PAGE_SIZE =
  8;


/* =========================
   HELPERS
========================= */

function hoursText(value){

  const minutes =
    Math.round(
      Number(value || 0) *
      60
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
  )
  .format(
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

  if(
    !y ||
    !m ||
    !d
  ){
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

function selectedPerson(){

  return people.find(
    person=>
      String(
        person.personId
      ) ===
      String(
        selectedPersonId
      )
  );
}

function filteredPeople(){

  const q =
    searchText
      .trim()
      .toLowerCase();

  if(!q){
    return people;
  }

  return people.filter(
    person=>
      String(
        person.name ||
        ""
      )
      .toLowerCase()
      .includes(q)
  );
}


/* =========================
   LOAD GROUP
========================= */

async function loadSummary(){

  const list =
    document.getElementById(
      "peopleList"
    );

  list.innerHTML = `
    <div class="no-people">
      Loading...
    </div>
  `;

  document.getElementById(
    "detailPanel"
  ).innerHTML = `
    <div class="detail-empty">
      Loading...
    </div>
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

    people =
      Array.isArray(
        data.people
      )
        ? data.people
        : [];

    selectedPersonId =
      people[0]
        ?.personId ||
      "";

    currentPage =
      1;

    renderPeople();
    renderDetail();

  }catch(error){

    console.error(
      "PAYROLL SUMMARY ERROR:",
      error
    );

    list.innerHTML = `
      <div class="no-people">
        ${escapeHtml(error.message)}
      </div>
    `;

    document.getElementById(
      "detailPanel"
    ).innerHTML = `
      <div class="detail-empty">
        Unable to load payroll history.
      </div>
    `;
  }
}


/* =========================
   LEFT LIST
========================= */

function renderPeople(){

  const list =
    document.getElementById(
      "peopleList"
    );

  const rows =
    filteredPeople();

  if(!rows.length){

    list.innerHTML = `
      <div class="no-people">
        No matching names.
      </div>
    `;

    return;
  }

  list.innerHTML =
    rows
      .map(
        person=>{

          const periods =
            Array.isArray(
              person.periods
            )
              ? person.periods
              : [];

          const last =
            periods[0] ||
            null;

          const active =
            String(
              selectedPersonId
            ) ===
            String(
              person.personId
            );

          return `
            <button
              class="person-item ${active ? "active" : ""}"
              type="button"
              data-person-id="${escapeHtml(person.personId)}">

              <div class="person-name">
                ${escapeHtml(person.name)}
              </div>

              ${
                last
                  ? `
                    <div class="person-last">
                      Last Pay Period:
                      ${escapeHtml(dateText(last.from))}
                      →
                      ${escapeHtml(dateText(last.to))}
                    </div>

                    <div class="person-last-row">

                      <span class="person-hours">
                        ${escapeHtml(hoursText(last.totalHours))}
                      </span>

                      <span class="person-money">
                        ${escapeHtml(money(last.totalEarnings))}
                      </span>

                    </div>
                  `
                  : `
                    <div class="person-last">
                      No closed pay periods yet.
                    </div>
                  `
              }

            </button>
          `;
        }
      )
      .join("");

  list
    .querySelectorAll(
      ".person-item"
    )
    .forEach(
      button=>{

        button.addEventListener(
          "click",
          ()=>{

            selectedPersonId =
              String(
                button.dataset.personId ||
                ""
              );

            currentPage =
              1;

            renderPeople();
            renderDetail();
          }
        );
      }
    );
}


/* =========================
   RIGHT DETAIL
========================= */

function renderDetail(){

  const panel =
    document.getElementById(
      "detailPanel"
    );

  const person =
    selectedPerson();

  if(!person){

    panel.innerHTML = `
      <div class="detail-empty">
        Select a name from the list.
      </div>
    `;

    return;
  }

  const periods =
    Array.isArray(
      person.periods
    )
      ? person.periods
      : [];

  const totalHours =
    periods.reduce(
      (sum,row)=>
        sum +
        Number(
          row.totalHours ||
          0
        ),
      0
    );

  const totalTrips =
    periods.reduce(
      (sum,row)=>
        sum +
        Number(
          row.totalTrips ||
          0
        ),
      0
    );

  const totalEarnings =
    periods.reduce(
      (sum,row)=>
        sum +
        Number(
          row.totalEarnings ||
          0
        ),
      0
    );

  const pageCount =
    Math.max(
      1,
      Math.ceil(
        periods.length /
        PAGE_SIZE
      )
    );

  if(
    currentPage >
    pageCount
  ){
    currentPage =
      pageCount;
  }

  const start =
    (
      currentPage -
      1
    ) *
    PAGE_SIZE;

  const pageRows =
    periods.slice(
      start,
      start +
      PAGE_SIZE
    );

  const tripsCard =
    currentType ===
      "driver"
      ? `
        <div class="card">
          <span>Total Trips</span>
          <b>${Number(totalTrips)}</b>
        </div>
      `
      : "";

  const tripsHead =
    currentType ===
      "driver"
      ? "<th>Trips</th>"
      : "";

  const tableRows =
    pageRows.length
      ? pageRows
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
                  ${escapeHtml(hoursText(row.totalHours))}
                </td>

                ${
                  currentType === "driver"
                    ? `
                      <td>
                        ${Number(row.totalTrips || 0)}
                      </td>
                    `
                    : ""
                }

                <td class="money">
                  ${escapeHtml(money(row.totalEarnings))}
                </td>

              </tr>
            `
          )
          .join("")
      : `
        <tr>
          <td
            colspan="${
              currentType === "driver"
                ? 5
                : 4
            }">
            No closed payroll periods yet.
          </td>
        </tr>
      `;

  panel.innerHTML = `
    <h2 class="detail-title">
      ${escapeHtml(person.name)} — Payroll History
    </h2>

    <div class="detail-sub">
      Rolling last 24 months
    </div>

    <section class="cards">

      <div class="card">
        <span>Total Hours</span>
        <b>${escapeHtml(hoursText(totalHours))}</b>
      </div>

      ${tripsCard}

      <div class="card money">
        <span>Total Earnings</span>
        <b>${escapeHtml(money(totalEarnings))}</b>
      </div>

    </section>

    <section class="table-card">

      <div class="table-wrap">

        <table>

          <thead>
            <tr>
              <th>From</th>
              <th>To</th>
              <th>Hours</th>
              ${tripsHead}
              <th>Total Earnings</th>
            </tr>
          </thead>

          <tbody>
            ${tableRows}
          </tbody>

        </table>

      </div>

    </section>

    ${
      periods.length > PAGE_SIZE
        ? paginationHtml(
            pageCount
          )
        : ""
    }
  `;

  bindPagination();
}


/* =========================
   PAGINATION
========================= */

function paginationHtml(
  pageCount
){

  const buttons = [];

  buttons.push(`
    <button
      class="page-btn"
      data-page="${
        Math.max(
          1,
          currentPage - 1
        )
      }"
      ${currentPage === 1 ? "disabled" : ""}>
      ‹
    </button>
  `);

  for(
    let page = 1;
    page <= pageCount;
    page++
  ){

    buttons.push(`
      <button
        class="page-btn ${page === currentPage ? "active" : ""}"
        data-page="${page}">
        ${page}
      </button>
    `);
  }

  buttons.push(`
    <button
      class="page-btn"
      data-page="${
        Math.min(
          pageCount,
          currentPage + 1
        )
      }"
      ${currentPage === pageCount ? "disabled" : ""}>
      ›
    </button>
  `);

  return `
    <div class="pagination">
      ${buttons.join("")}
    </div>
  `;
}

function bindPagination(){

  document
    .querySelectorAll(
      ".page-btn[data-page]"
    )
    .forEach(
      button=>{

        button.addEventListener(
          "click",
          ()=>{

            if(button.disabled){
              return;
            }

            currentPage =
              Number(
                button.dataset.page ||
                1
              );

            renderDetail();
          }
        );
      }
    );
}


/* =========================
   SEARCH
========================= */

document.getElementById(
  "nameSearch"
)
.addEventListener(
  "input",
  event=>{

    searchText =
      String(
        event.target.value ||
        ""
      );

    const filtered =
      filteredPeople();

    if(
      filtered.length &&
      !filtered.some(
        person=>
          String(
            person.personId
          ) ===
          String(
            selectedPersonId
          )
      )
    ){
      selectedPersonId =
        filtered[0]
          .personId;
    }

    renderPeople();
    renderDetail();
  }
);


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
              "driver"
            );

          searchText =
            "";

          document.getElementById(
            "nameSearch"
          ).value =
            "";

          loadSummary();
        }
      );
    }
  );


/* =========================
   START
========================= */

loadSummary();