let trips = [];
let currentTab = "individual";

/* LOAD */
async function load(){
  const res = await fetch("/api/trips/summary");
  trips = await res.json();
  apply();
}

/* SWITCH */
function switchTab(type,btn){
  currentTab = type;

  document.querySelectorAll(".tab").forEach(b=>b.classList.remove("active"));
  btn.classList.add("active");

  document.getElementById("individualView").style.display =
    type==="individual" ? "block" : "none";

  document.getElementById("sharedView").style.display =
    type==="shared" ? "block" : "none";

  apply();
}

/* PRICE */
function getPrice(t){
  if(t.status==="Completed") return t.finalPrice || t.priceAmount || 0;
  if(t.status==="NoShow") return 15;
  if(t.status==="Cancelled") return 15;
  return 0;
}

/* RENDER */
function render(data){

  if(currentTab==="individual"){
    const body = document.getElementById("tableBody");
    body.innerHTML="";

    data.forEach(t=>{
      if(t.isShared) return;
      if(!["Completed","Cancelled","NoShow"].includes(t.status)) return;

      body.innerHTML += `
      <tr>
        <td>${t.tripNumber}</td>
        <td>${t.tripDate}</td>
        <td>${t.tripTime}</td>
        <td>${t.clientName}</td>
        <td class="${t.status.toLowerCase()}">${t.status}</td>
        <td>$${getPrice(t)}</td>
      </tr>`;
    });
  }

  if(currentTab==="shared"){
    const box = document.getElementById("sharedView");
    box.innerHTML="";

    data.forEach(t=>{

      if(!t.isShared) return;

      const passengers = (t.passengers || []).filter(p =>
        ["Completed","Cancelled","NoShow"].includes(p.status)
      );

      if(passengers.length===0) return;

      let html = `
      <div class="shared-box">

        <div class="shared-header">
          <div>Trip # ${t.tripNumber}</div>
          <div>${t.tripDate} - ${t.tripTime}</div>
        </div>
      `;

      passengers.forEach(p=>{

        let price = 0;

        if(p.status==="Completed"){
          price = t.pricePerPassenger || 15;
        }

        if(p.status==="NoShow" || p.status==="Cancelled"){
          price = 15;
        }

        html += `
        <div class="passenger">
          <div>${p.name}</div>
          <div class="${p.status.toLowerCase()}">${p.status}</div>
          <div>$${price}</div>
        </div>
        `;
      });

      html += `</div>`;

      box.innerHTML += html;

    });
  }
}

/* FILTER */
function apply(){

  const d = document.getElementById("date").value;
  const s = document.getElementById("search").value.toLowerCase();

  const filtered = trips.filter(t=>{

    const matchDate = !d || t.tripDate===d;

    const matchText =
      !s ||
      (t.clientName||"").toLowerCase().includes(s) ||
      (t.tripNumber||"").toLowerCase().includes(s);

    return matchDate && matchText;
  });

  render(filtered);
}

load();