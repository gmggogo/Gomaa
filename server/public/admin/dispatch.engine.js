const Engine = {

trips:[],
drivers:[],
schedule:{},

selected:{},
editMode:false,

map:null,
markers:[],

async load(){

const data = await Store.load()

this.trips = (data.trips || []).filter(t=>t.dispatchSelected && !t.disabled)
this.drivers = data.drivers || []
this.schedule = data.schedule || {}

this.initMap()

UI.render()

},

initMap(){

this.map = L.map('map').setView([33.4484,-112.0740],10)

L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{
maxZoom:19
}).addTo(this.map)

},

renderMap(){

this.markers.forEach(m=>this.map.removeLayer(m))
this.markers=[]

this.drivers.forEach(d=>{

if(!d.lat||!d.lng) return

const m=L.marker([d.lat,d.lng])
.addTo(this.map)
.bindPopup(d.name)

this.markers.push(m)

})

},

focusDriver(id){

const d=this.drivers.find(x=>x._id===id)
if(!d) return

this.map.setView([d.lat,d.lng],13)

},

toggleEdit(){

this.editMode=!this.editMode

document.getElementById("editBtn").innerText=
this.editMode?"Save":"Edit"

}

}