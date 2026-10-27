"use strict";
const MtmConnector = require("./mtmConnector");

class MtmMockConnector extends MtmConnector {
  constructor(options = {}) {
    super(options);
    this.claimed = new Set();
    this.sequence = 0;
    this.reset();
  }
  reset(){
    this.claimed.clear();
    this.sequence++;
    const date = new Date(); date.setDate(date.getDate()+1);
    const tomorrow = date.toISOString().slice(0,10);
    this.trips = [
      {externalTripId:`MTM-TEST-LONG-${this.sequence}-001`,tripNumber:`MTM-TEST-LONG-${this.sequence}-001`,appointmentDate:tomorrow,pickupTime:"09:00",appointmentTime:"10:00",pickupAddress:"200 E Knox Rd, Chandler, AZ 85225",dropoffAddress:"Tucson, AZ 85701",pickupZip:"85225",dropoffZip:"85701",tripMiles:118.4,mode:"Cab",memberName:"Mock Long Rider",memberId:"M10001",passengerType:"Ambulatory",levelOfService:"Standard",numberOfRiders:1,specialNeeds:"None",driverPickupNotes:"Mock pickup note",driverDropoffNotes:"Mock dropoff note",price:175,legs:[{leg:"A",pickupTime:"09:00"},{leg:"B",pickupTime:"14:00"}]},
      {externalTripId:`MTM-TEST-SHORT-${this.sequence}-001`,tripNumber:`MTM-TEST-SHORT-${this.sequence}-001`,appointmentDate:tomorrow,pickupTime:"11:30",appointmentTime:"12:00",pickupAddress:"Chandler, AZ 85224",dropoffAddress:"Chandler, AZ 85225",pickupZip:"85224",dropoffZip:"85225",tripMiles:12.8,mode:"Cab",memberName:"Mock Short Rider",memberId:"M10002",passengerType:"Ambulatory",levelOfService:"Standard",numberOfRiders:1,specialNeeds:"Wheelchair not required",driverPickupNotes:"Call on arrival",driverDropoffNotes:"Front entrance",price:34,legs:[{leg:"A",pickupTime:"11:30"}]},
      {externalTripId:`MTM-TEST-PARA-${this.sequence}-001`,tripNumber:`MTM-TEST-PARA-${this.sequence}-001`,appointmentDate:tomorrow,pickupTime:"15:15",appointmentTime:"16:00",pickupAddress:"Mesa, AZ 85201",dropoffAddress:"Phoenix, AZ 85001",pickupZip:"85201",dropoffZip:"85001",tripMiles:26.5,mode:"Paralift",memberName:"Mock Paralift Rider",memberId:"M10003",passengerType:"Wheelchair",levelOfService:"Paralift",numberOfRiders:1,specialNeeds:"Wheelchair",driverPickupNotes:"Use ramp",driverDropoffNotes:"Main lobby",price:72,legs:[{leg:"A",pickupTime:"15:15"}]}
    ];
    return this.trips;
  }
  async connect(){this.connected=true;return {connected:true,status:"CONNECTED",mock:true,message:"Mock MTM connected"};}
  async disconnect(){this.connected=false;return {connected:false,status:"DISCONNECTED",mock:true};}
  async listAvailableTrips(){return this.trips.filter(t=>!this.claimed.has(t.externalTripId));}
  async getTripDetails(id){return this.trips.find(x=>x.externalTripId===id)||null;}
  async claimTrip(id){const trip=await this.getTripDetails(id);if(!trip||this.claimed.has(id))return {success:false,claimed:false,reason:"NOT_AVAILABLE"};this.claimed.add(id);return {success:true,claimed:true,externalTripId:id,assignmentNumber:`ASN-${id}`};}
  async getAcceptedTrip(id){if(!this.claimed.has(id))return null;const trip=await this.getTripDetails(id);return trip?{...trip,assignmentNumber:`ASN-${id}`,accepted:true}:null;}
}
module.exports=MtmMockConnector;
