const CORE_SERVICE_CODES = new Set([
  "ST",
  "WH",
  "SH",
  "LM",
  "TX",
  "XL"
]);

const CORE_SERVICE_ALIASES = new Map([
  ["ST","ST"],
  ["STANDARD","ST"],

  ["WH","WH"],
  ["WC","WH"],
  ["WHEELCHAIR","WH"],
  ["WHEEL CHAIR","WH"],

  ["SH","SH"],
  ["SHARED","SH"],

  ["LM","LM"],
  ["LIMO","LM"],
  ["LIMOUSINE","LM"],

  ["TX","TX"],
  ["TAXI","TX"],

  ["XL","XL"],
  ["XL SERVICE","XL"]
]);

function clean(value){
  return String(value ?? "").trim();
}

function normalizeSpaces(value){
  return clean(value)
    .toUpperCase()
    .replace(/[_-]+/g," ")
    .replace(/\s+/g," ");
}

function customGateFromSlot(slot){
  const n = Number(slot || 0);

  if(
    !Number.isInteger(n) ||
    n < 1 ||
    n > 4
  ){
    return "";
  }

  return `CUSTOM_${n}`;
}

function customSlotFromGate(value){
  const normalized =
    normalizeSpaces(value);

  const match =
    normalized.match(
      /^CUSTOM\s*(?:SERVICE\s*)?([1-4])$/
    );

  return match
    ? Number(match[1])
    : 0;
}

function normalizeServiceCode(value){
  const normalized =
    normalizeSpaces(value);

  if(!normalized){
    return "";
  }

  const customSlot =
    customSlotFromGate(normalized);

  if(customSlot){
    return customGateFromSlot(customSlot);
  }

  if(CORE_SERVICE_ALIASES.has(normalized)){
    return CORE_SERVICE_ALIASES.get(normalized);
  }

  if(normalized.includes("STANDARD")){
    return "ST";
  }

  if(
    normalized.includes("WHEELCHAIR") ||
    normalized.includes("WHEEL CHAIR")
  ){
    return "WH";
  }

  if(normalized.includes("SHARED")){
    return "SH";
  }

  if(
    normalized.includes("LIMOUSINE") ||
    normalized.startsWith("LIMO ")
  ){
    return "LM";
  }

  if(normalized.includes("TAXI")){
    return "TX";
  }

  if(normalized.startsWith("XL ")){
    return "XL";
  }

  return normalized;
}

function normalizeOperationalCode(value){
  return clean(value)
    .normalize("NFKD")
    .replace(/[^A-Za-z]/g,"")
    .toUpperCase()
    .slice(0,2);
}

function generateCustomServiceCode(title){
  return normalizeOperationalCode(title);
}

function isCoreServiceCode(value){
  return CORE_SERVICE_CODES.has(
    normalizeServiceCode(value)
  );
}

function isCustomGate(value){
  return /^CUSTOM_[1-4]$/.test(
    normalizeServiceCode(value)
  );
}

function getCustomSlot(service){
  const slot =
    Number(service?.customSlot || 0);

  if(
    Number.isInteger(slot) &&
    slot >= 1 &&
    slot <= 4
  ){
    return slot;
  }

  const candidates = [
    service?.customGateKey,
    service?.serviceIdentity,
    service?.serviceKey
  ];

  for(const candidate of candidates){
    const resolved =
      customSlotFromGate(candidate);

    if(resolved){
      return resolved;
    }
  }

  return 0;
}

/*
  MASTER IDENTITY

  Core services:
    ST / WH / SH / LM / TX / XL

  Custom services:
    CUSTOM_1 / CUSTOM_2 / CUSTOM_3 / CUSTOM_4

  This value belongs to Platform Admin permissions.
  It must NOT change when the tenant renames a custom service.
*/
function getServiceGateKey(service){
  const slot =
    getCustomSlot(service);

  if(slot){
    return customGateFromSlot(slot);
  }

  const candidates = [
    service?.serviceKey,
    service?.serviceCode,
    service?.serviceType,
    service?.serviceSuffix,
    service?.suffix,
    service?.companySuffix,
    service?.reservedSuffix,
    service?.title,
    service?.name,
    service?.serviceName
  ];

  for(const candidate of candidates){
    const code =
      normalizeServiceCode(candidate);

    if(CORE_SERVICE_CODES.has(code)){
      return code;
    }
  }

  return "";
}

/*
  OPERATIONAL / TRIP CODE

  Core service => original service code.
  Custom service => persisted customServiceCode, normally the first
  two letters of the configured custom service name.

  This code is what trip-number generation and the pricing engines
  should use after a custom service has been configured.
*/
function getServiceOperationalCode(service){
  if(!service){
    return "";
  }

  const gate =
    getServiceGateKey(service);

  if(
    gate &&
    CORE_SERVICE_CODES.has(gate)
  ){
    return gate;
  }

  const customCode =
    normalizeOperationalCode(
      service?.customServiceCode
    );

  if(customCode.length === 2){
    return customCode;
  }

  const candidates = [
    service?.serviceKey,
    service?.serviceCode,
    service?.serviceType,
    service?.serviceSuffix,
    service?.suffix,
    service?.companySuffix,
    service?.reservedSuffix
  ];

  for(const candidate of candidates){
    const normalized =
      normalizeServiceCode(candidate);

    if(
      !normalized ||
      isCustomGate(normalized)
    ){
      continue;
    }

    const operational =
      normalizeOperationalCode(candidate);

    if(operational.length === 2){
      return operational;
    }
  }

  return "";
}

function getServiceDisplayName(service){
  return clean(
    service?.title ||
    service?.serviceName ||
    service?.name ||
    getServiceOperationalCode(service) ||
    getServiceGateKey(service)
  );
}

function isCustomService(service){
  return getCustomSlot(service) > 0;
}

function isCustomServiceConfigured(service){
  if(!isCustomService(service)){
    return true;
  }

  return (
    service?.customConfigured === true &&
    getServiceOperationalCode(service).length === 2 &&
    getServiceDisplayName(service).length >= 2
  );
}

/*
  Returns every useful identity for matching a service coming from
  old trips, broker records, facility overrides, or current Service docs.
*/
function getServiceMatchKeys(service){
  const values = [
    service?._id,
    getServiceGateKey(service),
    getServiceOperationalCode(service),
    service?.customServiceCode,
    service?.serviceKey,
    service?.serviceCode,
    service?.serviceType,
    service?.serviceSuffix,
    service?.suffix,
    service?.companySuffix,
    service?.reservedSuffix,
    service?.title,
    service?.name,
    service?.serviceName
  ];

  const out = new Set();

  for(const value of values){
    const raw = clean(value);

    if(!raw){
      continue;
    }

    out.add(raw.toUpperCase());

    const normalized =
      normalizeServiceCode(raw);

    if(normalized){
      out.add(normalized);
    }

    const operational =
      normalizeOperationalCode(raw);

    if(operational.length === 2){
      out.add(operational);
    }
  }

  return Array.from(out);
}

function resolveServiceIdentity(service){
  const customSlot =
    getCustomSlot(service);

  const gateKey =
    getServiceGateKey(service);

  const operationalCode =
    getServiceOperationalCode(service);

  return {
    isCustom:
      customSlot > 0,

    customSlot,

    gateKey,

    operationalCode,

    displayName:
      getServiceDisplayName(service),

    configured:
      isCustomServiceConfigured(service)
  };
}

module.exports = {
  CORE_SERVICE_CODES,
  normalizeServiceCode,
  normalizeOperationalCode,
  generateCustomServiceCode,
  customGateFromSlot,
  customSlotFromGate,
  isCoreServiceCode,
  isCustomGate,
  getCustomSlot,
  getServiceGateKey,
  getServiceOperationalCode,
  getServiceDisplayName,
  isCustomService,
  isCustomServiceConfigured,
  getServiceMatchKeys,
  resolveServiceIdentity
};
