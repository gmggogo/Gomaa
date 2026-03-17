const UI = {

  /* ===============================
     RENDER TRIPS
  ================================= */

  renderTrips(trips){

    const table = document.getElementById("dispatchTable")
    if(!table) return

    if(!trips.length){
      table.innerHTML = `<tr><td colspan="10">No trips</td></tr>`
      return
    }

    table.innerHTML = trips.map(trip=>{

      const driver = Engine.drivers.find(d=>d._id === trip.driverId)

      const driverName = driver ? driver.name : "-"
      const vehicle = driver ? driver.vehicle : "-"

      return `
      <tr>
        <td>${trip.tripNumber || "-"}</td>
        <td>${trip.clientName || "-"}</td>
        <td>${trip.pickup || "-"}</td>
        <td>${trip.dropoff || "-"}</td>
        <td>${trip.tripDate || "-"}</td>
        <td>${trip.tripTime || "-"}</td>
        <td>${trip.notes || "-"}</td>
        <td>${driverName}</td>
        <td>${vehicle}</td>
      </tr>
      `
    }).join("")

  },

  /* ===============================
     ACTIVE DRIVERS
  ================================= */

  renderDriversPanel(drivers, schedule, liveDrivers){

    const box = document.getElementById("driversPanel")
    if(!box) return

    if(!drivers.length){
      box.innerHTML = "No drivers"
      return
    }

    const today = new Date().toLocaleDateString("en-US",{
      weekday:"short"
    })

    box.innerHTML = drivers
      .filter(d=>{
        const days = schedule[d._id] || []
        return days.includes(today)
      })
      .map(d=>{

        const isLive = liveDrivers.find(ld=>ld.driverId === d._id)

        return `
        <div style="
          padding:10px;
          margin-bottom:8px;
          border-radius:8px;
          background:${isLive ? "#d1fae5" : "#f3f4f6"};
        ">
          <b>${d.name}</b><br>
          ${d.vehicle || "No vehicle"}
        </div>
        `
      }).join("")

  }

}