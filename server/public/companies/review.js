window.addEventListener("DOMContentLoaded", async () => {

const token = localStorage.getItem("token");
const role  = localStorage.getItem("role");
const companyName = localStorage.getItem("name") || "";

if (!token || role !== "company") {
  window.location.replace("company-login.html");
  return;
}

const container = document.getElementById("tripsContainer");

/* ================= HELPERS ================= */

function getAZNow(){
  return new Date(
    new Date().toLocaleString("en-US",{timeZone:"America/Phoenix"})
  );
}

function minutesToTrip(t){
  if(!t.tripDate || !t.tripTime) return null;
  const dt = new Date(t.tripDate + "T" + t.tripTime + ":00");
  return (dt - getAZNow()) / 60000;
}

function escapeHtml(value){
  return String(value ?? "")
    .replace(/&/g,"&amp;")
    .replace(/"/g,"&quot;")
    .replace(/</g,"&lt;")
    .replace(/>/g,"&gt;");
}

/* ================= SERVER ================= */

async function fetchTrips(){

  const url = companyName
    ? "/api/trips/company/" + encodeURIComponent(companyName)
    : "/api/trips/company";

  const res = await fetch(url,{
    headers:{ Authorization:"Bearer " + token }
  });

  if(!res.ok){
    container.innerHTML = "<div>Server Error</div>";
    return [];
  }

  return await res.json();
}

async function updateTrip(id,payload){
  await fetch("/api/trips/" + id,{
    method:"PUT",
    headers:{
      "Content-Type":"application/json",
      Authorization:"Bearer " + token
    },
    body:JSON.stringify(payload)
  });
}

async function deleteTrip(id){
  await fetch("/api/trips/" + id,{
    method:"DELETE",
    headers:{ Authorization:"Bearer " + token }
  });
}

/* ================= GROUP ================= */

function groupByDate(list){
  const groups = {};
  list.forEach(t=>{
    const d = t.createdAt ? new Date(t.createdAt) : new Date();
    const key = d.toLocaleDateString();
    if(!groups[key]) groups[key] = [];
    groups[key].push(t);
  });
  return groups;
}

/* ================= RENDER ================= */

let trips = [];

function render(){

  container.innerHTML = "";

  const groups = groupByDate(trips);
  const dates = Object.keys(groups).sort((a,b)=>new Date(b)-new Date(a));

  dates.forEach(date=>{

    const title = document.createElement("div");
    title.className = "date-title";
    title.innerText = date;
    container.appendChild(title);

    const table = document.createElement("table");
    table.className = "review-table";

    table.innerHTML = `
      <tr>
        <th>#</th>
        <th>Trip#</th>
        <th>Entry</th>
        <th>Entry Phone</th>
        <th>Client</th>
        <th>Phone</th>
        <th>Pickup</th>
        <th>Drop</th>
        <th>Date</th>
        <th>Time</th>
        <th>Status</th>
        <th>Price</th>
        <th>Actions</th>
      </tr>
    `;

    groups[date].forEach((t,i)=>{

      const mins = minutesToTrip(t);
      const tr = document.createElement("tr");

      /* ===== SH ===== */
      let tripNumber = t.tripNumber || "";
      if((t.type === "SHARED" || t.tripType === "shared") && !tripNumber.includes("SH")){
        tripNumber += "-SH";
      }

      /* ===== CLIENT / PICKUP / DROP ===== */
      let client = "";
      let pickup = "";
      let drop = "";

      if(t.passengers && t.passengers.length){

        client = t.passengers
          .map((p,i)=>`${i+1}- ${p.clientName || "-"}`)
          .join("<br>");

        pickup = t.passengers
          .map((p,i)=>`${i+1}- ${p.pickup || "-"}`)
          .join("<br>");

        drop = t.passengers
          .map((p,i)=>`${i+1}- ${p.dropoff || "-"}`)
          .join("<br>");

      }else{
        client = escapeHtml(t.clientName || "-");
        pickup = escapeHtml(t.pickup || "-");
        drop = escapeHtml(t.dropoff || "-");
      }

      /* ===== PRICE ===== */
      let price =
        t.finalPrice ||
        t.priceAmount ||
        (t.passengers
          ? t.passengers.reduce((sum,p)=> sum + (p.priceAmount || 0),0)
          : 0);

      /* ===== BUTTONS ===== */
      let buttons = "";

      if(t.status !== "Cancelled"){
        if(mins > 120){
          buttons = `
            <button data-action="confirm">Confirm</button>
            <button data-action="delete">Delete</button>
          `;
        }else if(mins > 0){
          buttons = `
            <button data-action="confirm">Confirm</button>
            <button data-action="cancel">Cancel</button>
          `;
        }
      }

      tr.innerHTML = `
        <td>${i+1}</td>
        <td>${escapeHtml(tripNumber)}</td>
        <td>${escapeHtml(t.entryName)}</td>
        <td>${escapeHtml(t.entryPhone)}</td>

        <td style="white-space:normal; line-height:1.6">${client}</td>
        <td>${escapeHtml(t.clientPhone || "")}</td>

        <td style="white-space:normal; line-height:1.6">${pickup}</td>
        <td style="white-space:normal; line-height:1.6">${drop}</td>

        <td>${escapeHtml(t.tripDate)}</td>
        <td>${escapeHtml(t.tripTime)}</td>

        <td>${escapeHtml(t.status)}</td>

        <td style="color:#22c55e;font-weight:bold">
          $${Number(price).toFixed(2)}
        </td>

        <td>${buttons}</td>
      `;

      table.appendChild(tr);

    });

    container.appendChild(table);

  });

}

/* ================= ACTIONS ================= */

container.addEventListener("click", async e=>{

  const btn = e.target.closest("button");
  if(!btn) return;

  const tr = btn.closest("tr");
  const id = tr.dataset.id;
  const action = btn.dataset.action;

  const trip = trips.find(t=>t._id === id);
  if(!trip) return;

  if(action === "confirm"){
    await updateTrip(id,{ ...trip, status:"Confirmed" });
  }

  if(action === "cancel"){
    await updateTrip(id,{ ...trip, status:"Cancelled" });
  }

  if(action === "delete"){
    await deleteTrip(id);
  }

  trips = await fetchTrips();
  render();

});

/* ================= INIT ================= */

async function loadTrips(){
  trips = await fetchTrips();
  render();
}

await loadTrips();

setInterval(async()=>{
  trips = await fetchTrips();
  render();
},30000);

});