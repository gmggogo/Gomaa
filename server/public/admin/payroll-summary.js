/* =========================================================
   FILE: public/admin/payroll-summary.js

   SUPER ADMIN
   PER-PERSON PAYROLL SUMMARY
   NO "ALL" TAB
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

async function loadSummary(){

  const list =
    document.getElementById(
      "peopleList"
    );

  list.innerHTML = `
    <div class="empty">
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

    const totals =
      data.totals ||
      {};

    document.getElementById(
      "peopleCount"
    ).textContent =
      String(
        Number(
          totals.people ||
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

    document.getElementById(
      "tripsCard"
    ).style.display =
      currentType === "driver"
        ? "block"
        : "none";

    const people =
      Array.isArray(
        data.people
      )
        ? data.people
        : [];

    if(!people.length){

      list.innerHTML = `
        <div class="empty">
          No people found in this group.
        </div>
      `;

      return;
    }

    list.innerHTML =
      people
        .map(
          person=>{

            const periods =
              Array.isArray(
                person.periods
              )
                ? person.periods
                : [];

            const metaParts = [];

            if(person.jobTitle){
              metaParts.push(
                person.jobTitle
              );
            }

            if(person.employeeNumber){
              metaParts.push(
                `ID: ${person.employeeNumber}`
              );
            }

            const meta =
              metaParts.length
                ? `
                  <div class="person-meta">
                    ${escapeHtml(metaParts.join(" • "))}
                  </div>
                `
                : "";

            const tripHeader =
              currentType === "driver"
                ? "<th>Trips</th>"
                : "";

            const rows =
              periods.length
                ? periods
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

            return `
              <article class="person-card">

                <div class="person-head">

                  <div>

                    <div class="person-name">
                      ${escapeHtml(person.name)}
                    </div>

                    ${meta}

                  </div>

                  <div class="period-count">
                    ${periods.length} Period${
                      periods.length === 1
                        ? ""
                        : "s"
                    }
                  </div>

                </div>

                <div class="table-wrap">

                  <table>

                    <thead>
                      <tr>
                        <th>From</th>
                        <th>To</th>
                        <th>Total Hours</th>
                        ${tripHeader}
                        <th>Total Earnings</th>
                      </tr>
                    </thead>

                    <tbody>
                      ${rows}
                    </tbody>

                  </table>

                </div>

              </article>
            `;
          }
        )
        .join("");

  }catch(error){

    console.error(
      "ADMIN PAYROLL PERSON SUMMARY ERROR:",
      error
    );

    list.innerHTML = `
      <div class="empty">
        ${escapeHtml(error.message)}
      </div>
    `;
  }
}

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

          loadSummary();
        }
      );
    }
  );

loadSummary();