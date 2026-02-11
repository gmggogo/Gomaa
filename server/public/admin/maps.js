// ===============================
// ADMIN MAP
// ===============================

const map=L.map("map").setView([33.4484,-112.0740],11);

L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",{
  maxZoom:19
}).addTo(map);

setTimeout(()=>map.invalidateSize(),300);

let markers=[];

// ===============================
// ACTIVE DRIVERS FROM SCHEDULE
// ===============================

function getActiveDriversToday(){

  const schedule=JSON.parse(localStorage.getItem("driverSchedule")||"{}");

  const today=new Date().toLocaleDateString("en-US",{weekday:"short"});

  const active=[];

  Object.keys(schedule).forEach(name=>{
    if(schedule[name] && schedule[name][today]){
      active.push(name);
    }
  });

  return active;
}

// ===============================
// DRAW
// ===============================

function draw(){

  markers.forEach(m=>map.removeLayer(m));
  markers=[];

  const activeDrivers=getActiveDriversToday();
  const liveDrivers=JSON.parse(localStorage.getItem("LIVE_DRIVERS")||"[]");

  const filtered=liveDrivers.filter(d=>activeDrivers.includes(d.name));

  filtered.forEach((d,i)=>{

    const colors=["red","blue","green","orange","purple"];
    const color=colors[i%colors.length];

    const icon=L.icon({
      iconUrl:`https://maps.google.com/mapfiles/ms/icons/${color}-dot.png`,
      iconSize:[32,32]
    });

    const marker=L.marker([d.lat,d.lng],{icon})
      .addTo(map)
      .bindPopup(d.name);

    markers.push(marker);
  });
}

setInterval(draw,2000);
draw();

// ===============================
// SEARCH
// ===============================

document.getElementById("searchDriver")
.addEventListener("input",function(){

  const name=this.value.toLowerCase();
  const liveDrivers=JSON.parse(localStorage.getItem("LIVE_DRIVERS")||"[]");

  const found=liveDrivers.find(d=>d.name.toLowerCase().includes(name));

  if(found){
    map.setView([found.lat,found.lng],16);
  }

});