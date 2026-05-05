let currentTab = "individual";
let allTrips = [];

function switchTab(tab, el){
  currentTab = tab;

  document.querySelectorAll(".tab").forEach(b=>b.classList.remove("active"));
  el.classList.add("active");

  render();
}

function getStatusClass(s){
  if(s === "Cancelled") return "cancelled";
  if(s === "NoShow") return "noshow";
  return "completed";
}

function getPrice(s){
  if(s === "Cancelled") return 15;
  if(s === "NoShow") return 15;
  return null;
}

/* ================= LOAD ================= */
async function load(){

  const res = await fetch("/api/trips/summary");
  const data = await res.json();

  allTrips = data;
  render();
}

/* ================= RENDER ================= */
function render(){

  const box = document.getElementById("content");
  box.innerHTML = "";

  if(currentTab === "individual"){
    renderIndividual(box);
  }else{
    renderShared(box);
  }
}

/* ================= INDIVIDUAL ================= */
function renderIndividual(container){

  const list = allTrips.filter(t => !t.isShared);

  list.forEach(t=>{

    const price = getPrice(t.status);

    container.innerHTML += `
      <div class="trip-box">
        <div class="trip-header">
          <div>${t.tripNumber}</div>
          <div>${t.tripDate} ${t.tripTime} | ${Math.round(t.miles||0)} mi</div>
        </div>

        <table>
          <tr>
            <th>Name</th>
            <th>Phone</th>
            <th>Status</th>
            <th>Price</th>
          </tr>

          <tr class="${getStatusClass(t.status)}">
            <td>${t.clientName || "-"}</td>
            <td>${t.clientPhone || "-"}</td>
            <td>${t.status}</td>
            <td>${price ? "$"+price : "—"}</td>
          </tr>
        </table>
      </div>
    `;
  });
}

/* ================= SHARED ================= */
function renderShared(container){

  const list = allTrips.filter(t => t.isShared);

  list.forEach(t=>{

    let total = 0;

    let rows = "";

    (t.passengers || []).forEach(p=>{

      const price = getPrice(p.status);
      if(price) total += price;

      rows += `
        <tr class="${getStatusClass(p.status)}">
          <td>${p.name}</td>
          <td>${p.phone}</td>
          <td>${p.status}</td>
          <td>${price ? "$"+price : "—"}</td>
        </tr>
      `;
    });

    container.innerHTML += `
      <div class="trip-box">

        <div class="trip-header">
          <div>${t.tripNumber}</div>
          <div>${t.tripDate} ${t.tripTime} | ${Math.round(t.miles||0)} mi</div>
        </div>

        <table>
          <tr>
            <th>Name</th>
            <th>Phone</th>
            <th>Status</th>
            <th>Price</th>
          </tr>

          ${rows}

          <tr class="total-row">
            <td colspan="3">TOTAL</td>
            <td>$${total}</td>
          </tr>

        </table>

      </div>
    `;
  });
}

load();