"use strict";

/*
DESTINATION:
server/services/bookingFieldRegistry.js

PURPOSE:
One canonical booking-field system shared by:
- Get Quote
- Company / Facility
- Reserved
- Broker / External Trips

RULES:
1) Standard fields have one canonical key.
2) Custom fields keep a stable key (CUSTOM_n or saved key).
3) Aliases allow broker/external names to map to the same canonical field.
4) Manual values and broker values end up in the same dynamicBookingData snapshot.
5) Unknown broker fields are NEVER discarded; they are returned in unmappedExternalFields.
*/

function clean(value){
  return String(value ?? "").trim();
}

function upper(value){
  return clean(value).toUpperCase();
}

function aliasKey(value){
  return clean(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g,"");
}

function uniq(values){
  return [
    ...new Set(
      (Array.isArray(values) ? values : [])
        .map(clean)
        .filter(Boolean)
    )
  ];
}

const STANDARD_FIELDS = Object.freeze({
  appointmentTime:{
    label:"Appointment Time",
    fieldType:"TIME",
    aliases:[
      "appointmentTime",
      "appointment_time",
      "appointment",
      "appt_time",
      "apptTime",
      "appt"
    ]
  },

  returnTime:{
    label:"Return Time",
    fieldType:"TIME",
    aliases:[
      "returnTime",
      "return_time",
      "return",
      "pickup_return_time"
    ]
  },

  clientEmail:{
    label:"Client Email",
    fieldType:"EMAIL",
    aliases:[
      "clientEmail",
      "client_email",
      "email",
      "passengerEmail",
      "passenger_email"
    ]
  },

  memberId:{
    label:"Member ID",
    fieldType:"TEXT",
    aliases:[
      "memberId",
      "member_id",
      "member",
      "memberNumber",
      "member_number",
      "medicaidId",
      "medicaid_id"
    ]
  },

  serviceType:{
    label:"Service Type",
    fieldType:"TEXT",
    aliases:[
      "serviceType",
      "service_type",
      "service",
      "vehicleType",
      "vehicle_type"
    ]
  },

  tripType:{
    label:"Trip Type",
    fieldType:"TEXT",
    aliases:[
      "tripType",
      "trip_type"
    ]
  },

  company:{
    label:"Company / Facility Name",
    fieldType:"TEXT",
    aliases:[
      "company",
      "companyName",
      "company_name",
      "facility",
      "facilityName",
      "facility_name",
      "organization",
      "organizationName"
    ]
  },

  entryName:{
    label:"Data Entry Name",
    fieldType:"TEXT",
    aliases:[
      "entryName",
      "entry_name",
      "dataEntryName",
      "data_entry_name"
    ]
  },

  entryPhone:{
    label:"Data Entry Phone",
    fieldType:"PHONE",
    aliases:[
      "entryPhone",
      "entry_phone",
      "dataEntryPhone",
      "data_entry_phone"
    ]
  },

  brokerName:{
    label:"Broker Name",
    fieldType:"TEXT",
    aliases:[
      "brokerName",
      "broker_name",
      "broker"
    ]
  },

  brokerCode:{
    label:"Broker Code",
    fieldType:"TEXT",
    aliases:[
      "brokerCode",
      "broker_code"
    ]
  },

  brokerTripId:{
    label:"Broker Trip ID",
    fieldType:"TEXT",
    aliases:[
      "brokerTripId",
      "broker_trip_id",
      "externalTripId",
      "external_trip_id",
      "tripId",
      "trip_id",
      "reservationId",
      "reservation_id"
    ]
  },

  externalSource:{
    label:"External Source",
    fieldType:"TEXT",
    aliases:[
      "externalSource",
      "external_source",
      "source"
    ]
  },

  brokerNotes:{
    label:"Broker Notes",
    fieldType:"LONG_TEXT",
    aliases:[
      "brokerNotes",
      "broker_notes",
      "transportationNotes",
      "transportation_notes"
    ]
  },

  totalPassengers:{
    label:"Total Passengers",
    fieldType:"NUMBER",
    aliases:[
      "totalPassengers",
      "total_passengers",
      "passengerCount",
      "passenger_count",
      "riderCount",
      "rider_count"
    ]
  }
});

function standardDefinition(key){
  const row = STANDARD_FIELDS[key];
  if(!row) return null;

  return {
    source:"STANDARD",
    key,
    label:row.label,
    fieldType:upper(row.fieldType || "TEXT"),
    aliases:uniq([
      key,
      row.label,
      ...(row.aliases || [])
    ])
  };
}

function customDefinition(item,index=0){
  const slot =
    Number(item?.slot || 0) ||
    null;

  const key =
    clean(item?.key) ||
    (
      slot
        ? `CUSTOM_${slot}`
        : `CUSTOM_${index + 1}`
    );

  const label =
    clean(item?.label) ||
    key;

  return {
    source:"CUSTOM",
    slot,
    key,
    label,
    fieldType:
      upper(
        item?.fieldType ||
        "TEXT"
      ) ||
      "TEXT",
    aliases:
      uniq([
        key,
        label,
        ...(Array.isArray(item?.aliases)
          ? item.aliases
          : [])
      ]),
    placeholder:
      clean(item?.placeholder),
    options:
      Array.isArray(item?.options)
        ? item.options
            .map(clean)
            .filter(Boolean)
        : []
  };
}

function channelRule(item,channel){
  const name =
    clean(channel)
      .toLowerCase();

  const matrix =
    item?.matrix &&
    typeof item.matrix === "object"
      ? item.matrix
      : {};

  /*
    COMPANY / FACILITY COMPATIBILITY

    Add Trip for company accounts must read the Company booking-data rules.
    Older GH Mobility data used matrix.facility while newer configuration
    can use matrix.company / matrix.companies.

    Keep both directions backward-compatible so existing tenants do not lose
    their configured fields while the Company endpoint is migrated.
  */
  if(
    name === "company" ||
    name === "companies" ||
    name === "facility"
  ){
    return (
      matrix.company ||
      matrix.companies ||
      matrix.facility ||
      {}
    );
  }

  return (
    matrix[name] ||
    {}
  );
}

function bookingFieldDefinitions(
  config,
  channel
){
  const standard =
    Array.isArray(config?.standardFields)
      ? config.standardFields
      : [];

  const custom =
    Array.isArray(config?.customFields)
      ? config.customFields
      : [];

  const definitions = [];

  standard.forEach((item,index)=>{
    const key =
      clean(item?.key);

    if(!key) return;

    const base =
      standardDefinition(key) ||
      {
        source:"STANDARD",
        key,
        label:
          clean(item?.label) ||
          key,
        fieldType:
          upper(
            item?.fieldType ||
            "TEXT"
          ),
        aliases:
          uniq([
            key,
            item?.label,
            ...(Array.isArray(item?.aliases)
              ? item.aliases
              : [])
          ])
      };

    const rule =
      channelRule(item,channel);

    definitions.push({
      ...base,
      required:
        rule.required === true,
      showField:
        rule.showField === true,
      showColumn:
        rule.showColumn === true,
      showEye:
        rule.showEye === true,
      order:
        Number(
          item?.order ??
          item?.sortOrder ??
          index
        )
    });
  });

  custom.forEach((item,index)=>{
    if(!clean(item?.label)) return;

    const base =
      customDefinition(item,index);

    const rule =
      channelRule(item,channel);

    definitions.push({
      ...base,
      required:
        rule.required === true,
      showField:
        rule.showField === true,
      showColumn:
        rule.showColumn === true,
      showEye:
        rule.showEye === true,
      order:
        Number(
          item?.order ??
          item?.sortOrder ??
          (1000 + index)
        )
    });
  });

  return definitions.sort(
    (a,b)=>
      Number(a.order || 0) -
      Number(b.order || 0)
  );
}

function buildAliasIndex(definitions){

  const map = new Map();

  (Array.isArray(definitions)
    ? definitions
    : []
  ).forEach(field=>{

    const aliases =
      uniq([
        field?.key,
        field?.label,
        ...(Array.isArray(field?.aliases)
          ? field.aliases
          : [])
      ]);

    aliases.forEach(alias=>{
      const normalized =
        aliasKey(alias);

      if(
        normalized &&
        !map.has(normalized)
      ){
        map.set(
          normalized,
          field
        );
      }
    });
  });

  return map;
}

function flattenExternalObject(
  value,
  prefix="",
  out=[]
){
  if(
    value === null ||
    value === undefined
  ){
    return out;
  }

  if(Array.isArray(value)){
    value.forEach((item,index)=>{
      flattenExternalObject(
        item,
        prefix
          ? `${prefix}.${index}`
          : String(index),
        out
      );
    });

    return out;
  }

  if(
    typeof value === "object"
  ){
    Object.entries(value)
      .forEach(([key,item])=>{
        flattenExternalObject(
          item,
          prefix
            ? `${prefix}.${key}`
            : key,
          out
        );
      });

    return out;
  }

  out.push({
    path:prefix,
    key:
      prefix.split(".").pop() || prefix,
    value
  });

  return out;
}

function snapshotField(
  field,
  value,
  source
){
  return {
    source:
      upper(source) ||
      "MANUAL",
    key:
      clean(field?.key),
    slot:
      Number(field?.slot || 0) ||
      null,
    label:
      clean(field?.label) ||
      clean(field?.key),
    fieldType:
      upper(
        field?.fieldType ||
        "TEXT"
      ) ||
      "TEXT",
    required:
      field?.required === true,
    value:
      value === null ||
      value === undefined
        ? ""
        : String(value),
    aliases:
      uniq(
        field?.aliases
      )
  };
}

function normalizeManualValues(
  values,
  definitions,
  source="MANUAL"
){
  const byKey =
    new Map(
      (Array.isArray(definitions)
        ? definitions
        : []
      ).map(field=>[
        clean(field.key),
        field
      ])
    );

  const result = [];

  if(Array.isArray(values)){
    values.forEach(item=>{
      if(!item || typeof item !== "object"){
        return;
      }

      const key =
        clean(
          item.key ||
          item.fieldKey
        );

      const field =
        byKey.get(key) ||
        {
          key,
          label:
            clean(item.label) ||
            key,
          fieldType:
            item.fieldType ||
            "TEXT",
          slot:item.slot || null,
          aliases:[]
        };

      if(!key) return;

      result.push(
        snapshotField(
          field,
          item.value ??
          item.fieldValue ??
          item.answer ??
          "",
          item.source ||
          source
        )
      );
    });

    return result;
  }

  if(
    values &&
    typeof values === "object"
  ){
    Object.entries(values)
      .forEach(([key,value])=>{
        const field =
          byKey.get(clean(key));

        if(!field) return;

        result.push(
          snapshotField(
            field,
            value,
            source
          )
        );
      });
  }

  return result;
}

function mapExternalPayload(
  rawPayload,
  definitions,
  source="BROKER"
){
  const aliasIndex =
    buildAliasIndex(
      definitions
    );

  const mappedByKey =
    new Map();

  const unmapped = {};

  flattenExternalObject(
    rawPayload
  ).forEach(item=>{

    const candidates =
      uniq([
        item.key,
        item.path
      ]);

    let field = null;

    for(const candidate of candidates){
      const normalized =
        aliasKey(candidate);

      if(
        normalized &&
        aliasIndex.has(normalized)
      ){
        field =
          aliasIndex.get(normalized);
        break;
      }
    }

    if(field){
      const key =
        clean(field.key);

      if(
        key &&
        !mappedByKey.has(key)
      ){
        mappedByKey.set(
          key,
          snapshotField(
            field,
            item.value,
            source
          )
        );
      }

      return;
    }

    if(item.path){
      unmapped[item.path] =
        item.value;
    }
  });

  return {
    mapped:[
      ...mappedByKey.values()
    ],
    unmapped
  };
}

function mergeSnapshots(
  baseSnapshots,
  overrideSnapshots
){
  const map = new Map();

  const put = item=>{
    const key =
      clean(item?.key);

    if(!key) return;

    map.set(
      key,
      {
        ...item,
        key
      }
    );
  };

  (Array.isArray(baseSnapshots)
    ? baseSnapshots
    : []
  ).forEach(put);

  /*
    Explicit manual values override broker/external values.
    Blank manual values do NOT erase an already supplied broker value.
  */
  (Array.isArray(overrideSnapshots)
    ? overrideSnapshots
    : []
  ).forEach(item=>{

    const key =
      clean(item?.key);

    if(!key) return;

    const value =
      item?.value;

    if(
      (
        value === undefined ||
        value === null ||
        String(value).trim() === ""
      ) &&
      map.has(key)
    ){
      return;
    }

    put(item);
  });

  return [
    ...map.values()
  ];
}

function snapshotValue(
  snapshots,
  key
){
  const wanted =
    clean(key);

  const row =
    (Array.isArray(snapshots)
      ? snapshots
      : []
    ).find(
      item=>
        clean(item?.key) ===
        wanted
    );

  return row?.value ?? "";
}

module.exports = {
  STANDARD_FIELDS,
  aliasKey,
  bookingFieldDefinitions,
  buildAliasIndex,
  normalizeManualValues,
  mapExternalPayload,
  mergeSnapshots,
  snapshotValue
};
