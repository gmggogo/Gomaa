/* =========================
   DISPATCH API
========================= */

/* GET DISPATCH TRIPS */
app.get("/api/dispatch", async (req, res) => {

  try {

    const trips = await Trip.find({
      dispatchSelected: true
    }).sort({
      tripDate: 1,
      tripTime: 1,
      createdAt: -1
    });

    res.json(trips);

  } catch (err) {

    console.log(err);
    res.status(500).json({ message: "Dispatch load error" });

  }

});


/* SEND TRIP TO DISPATCH */
app.post("/api/dispatch/send/:id", async (req, res) => {

  try {

    const tripId = req.params.id;

    const trip = await Trip.findByIdAndUpdate(
      tripId,
      {
        dispatchSelected: true,
        status: "Dispatch Ready"
      },
      { new: true }
    );

    res.json(trip);

  } catch (err) {

    console.log(err);
    res.status(500).json({ message: "Dispatch send error" });

  }

});


/* ASSIGN DRIVER */
app.post("/api/dispatch/assignDriver", async (req, res) => {

  try {

    const { tripId, driverId } = req.body;

    if (!tripId || !driverId) {
      return res.status(400).json({ message: "Missing data" });
    }

    const driver = await User.findById(driverId);

    if (!driver) {
      return res.status(404).json({ message: "Driver not found" });
    }

    const trip = await Trip.findByIdAndUpdate(
      tripId,
      {
        driverId: driver._id,
        driverName: driver.name,
        vehicle: driver.vehicleNumber,
        status: "Driver Assigned"
      },
      { new: true }
    );

    res.json(trip);

  } catch (err) {

    console.log(err);
    res.status(500).json({ message: "Driver assign error" });

  }

});


/* SAVE DISPATCH NOTE */
app.post("/api/dispatch/note/:id", async (req, res) => {

  try {

    const tripId = req.params.id;
    const note = req.body.note || "";

    const trip = await Trip.findByIdAndUpdate(
      tripId,
      {
        dispatchNote: note
      },
      { new: true }
    );

    res.json(trip);

  } catch (err) {

    console.log(err);
    res.status(500).json({ message: "Note save error" });

  }

});


/* REMOVE FROM DISPATCH */
app.post("/api/dispatch/remove/:id", async (req, res) => {

  try {

    const tripId = req.params.id;

    const trip = await Trip.findByIdAndUpdate(
      tripId,
      {
        dispatchSelected: false,
        status: "Scheduled"
      },
      { new: true }
    );

    res.json(trip);

  } catch (err) {

    console.log(err);
    res.status(500).json({ message: "Dispatch remove error" });

  }

});