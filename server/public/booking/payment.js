<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Payment – Sunbeam</title>
<style>
body{font-family:Arial;background:#f8fafc;margin:0;padding:20px}
.box{background:#fff;padding:20px;border-radius:8px;max-width:500px;margin:auto;text-align:center}
button{padding:10px 16px;border:none;border-radius:6px;background:#22c55e;color:#fff;cursor:pointer}
</style>
</head>
<body>

<div class="box">
<h2>Payment Simulation</h2>
<p>Click below to simulate payment success.</p>
<button onclick="completePayment()">Complete Payment</button>
</div>

<script>
function completePayment(){
  const booking=JSON.parse(localStorage.getItem("pendingBooking"));
  if(!booking){alert("No booking found");return;}

  let hub=JSON.parse(localStorage.getItem("tripsHub"))||[];

  booking.tripNumber="IND-"+Date.now();
  booking.bookedAt=new Date().toISOString();
  booking.type="Individual";

  hub.push(booking);

  localStorage.setItem("tripsHub",JSON.stringify(hub));
  localStorage.removeItem("pendingBooking");
  localStorage.removeItem("tripData");

  alert("Payment successful ✔");
  location.href="../../admin/trips-hub.html";
}
</script>

</body>
</html>