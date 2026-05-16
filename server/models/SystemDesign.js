const mongoose = require("mongoose");

const ServiceSchema = new mongoose.Schema({

  id:String,

  active:{
    type:Boolean,
    default:false
  },

  title:String,

  description:String,

  image:String,

  link:String

});

const SystemDesignSchema =
new mongoose.Schema({

  companyName:{
    type:String,
    default:"Sunbeam Transportation"
  },

  timezone:{
    type:String,
    default:"America/Phoenix"
  },

  mainLogo:String,

  driverLogo:String,

  heroImage:String,

  aboutTitle:String,

  aboutText:String,

  quoteTitle:String,

  quoteText:String,

  extra1Active:Boolean,

  extra1Title:String,

  extra1Text:String,

  extra2Active:Boolean,

  extra2Title:String,

  extra2Text:String,

  contactTitle:String,

  contactPhone:String,

  contactEmail:String,

  footerText:String,

  services:[ServiceSchema]

},
{
  timestamps:true
});

module.exports =
mongoose.model(
  "SystemDesign",
  SystemDesignSchema
);