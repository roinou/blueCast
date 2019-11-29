const noble = require('@abandonware/noble');
const scanningTimeout = 15000;
const scanningRepeat = scanningTimeout + 5000; // Repeat scanning after 10 seconds for new peripherals.

const mqtt = require('mqtt');
const client = mqtt.connect('mqtt://centralpi');

noble.on('stateChange', function(state) {
  console.log('state changed!! ' + state);
  if (state === 'poweredOn') {
    //
    // Once the BLE radio has been powered on, it is possible
    // to begin scanning for services. Pass an empty array to
    // scan for all services (uses more time and power).
    //
    console.log('poweredOn scanning...');
    noble.startScanning([], true);
  } else {
    console.log('poweredOn stop scanning');
    noble.stopScanning();
  }
});

// Checking, Scanning, stopping repeatedly
/*setInterval( function(){
  if(noble.state==='poweredOn'){
    noble.startScanning();
    console.log('Starting Scan...');
    setTimeout(function(){
    noble.stopScanning();
    console.log('Stopping Scan...');
    }, scanningTimeout)
  }
}, scanningRepeat);*/

noble.on('discover', function(peripheral) {

  const advertisement = peripheral.advertisement;
  const manufacturerData = advertisement.manufacturerData;
  if (isDeviceCompatible(advertisement)) {
    console.log('Found peripheral:', advertisement.localName, peripheral.uuid);
    console.log(manufacturerData.toString('hex'));
    const desc = fetchDeviceDescription(peripheral);
    if (desc) {
      const data = decodeTempo(manufacturerData, desc);
      publish(data);
    }
  }
}); // End on Noble Discover!


function publish(data) {
  console.log("publishing data");
  client.publish('sensor', JSON.stringify(data),
    function(err) {if (err) console.log(err);});
  publishMetric(data, ['battery', 'humidity', 'temperature']);
}

function publishMetric(data, metrics) {
  metrics.forEach(metric => {
    if (data.data && data.data[metric])
      client.publish('sensor/' + data.name + '/' + metric, "" + data.data[metric]);
  });
}

/**
 * checks if device starts with 33 01 i.e. it's a blue maestro device
 * @param advertisement
 */
function isDeviceCompatible(advertisement) {
  if (advertisement && advertisement.manufacturerData && advertisement.manufacturerData.length > 2) {
    // fixme magic ID
    return advertisement.manufacturerData.slice(0, 2).toString('hex') === "3301";
  }
  return false;
}

// keeps track of discovered devices
const deviceMap = {};

function fetchDeviceDescription(peripheral) {
  const uuid = peripheral.uuid;
  if (deviceMap[uuid] === undefined) {
    deviceMap[uuid] = describeDevice(peripheral);
  }
  return deviceMap[uuid];
}

function describeDevice(peripheral) {
  const adv = peripheral.advertisement;
  if (adv.manufacturerData.length <= 16) {
    return {
      version: adv.manufacturerData.readUInt8(2),
      label: adv.localName
    };
  }
  return undefined;
}

function decodeTempo(buf, description) {
  const data = {};
  //console.log('buffer length:', buf.length);
  if (buf.length <= 16) {
    decodeShortBeacon(buf, description, data);
  } else {
    decodeLongBeacon(buf, data, description);
  }
  return {
    timestamp: new Date(),
    name: description.label,
    version: description.version,
    data: data
  };
}

function decodeShortBeacon(buf, description, data) {
  data.version = buf.readUInt8(2);
  data.battery = buf.readUInt8(3);
  data.timeInterval = buf.readUInt16BE(4);
  data.timeIntervalPosition = buf.readUInt16BE(6);
  data.temperature = buf.readInt16BE(8) / 10;
  data.humidity = buf.readInt16BE(10) / 10;
  data.mode = buf.readInt8(14);
  data.breachCount = buf.readUInt8(15);
  if (description.version === 23) {
    data.dewPoint = buf.readInt16BE(12) / 10;
  } else if (description.version === 37) {
    data.pressure = buf.readInt16BE(12) / 10;
  }
}

function decodeLongBeacon(buf, data, description) {
  data.highest24Temperature = buf.readInt16BE(10) / 10;
  data.highest24Humidity = buf.readInt16BE(12) / 10;
  data.lowest24Temperature = buf.readInt16BE(14) / 10;
  data.lowest24Humidity = buf.readInt16BE(16) / 10;
  data.average24Temperature = buf.readInt16BE(18) / 10;
  data.average24humidity = buf.readInt16BE(20) / 10;
  data.globalIdentifier = buf.readUInt8(22);
  data.referenceData = buf.readUInt32BE(23);
  if (description.version === 23) {
    decodeLongTempoBeacon(buf, data);
  } else if (description.version === 27) {
    decodeLongPebbleBeacon(buf, data);
  }
}

function decodeLongTempoBeacon(buf, data) {
  data.highestTemperature = buf.readInt16BE(2) / 10;
  data.highestHumidity = buf.readInt16BE(4) / 10;
  data.lowestTemperature = buf.readInt16BE(6) / 10;
  data.lowestHumidity = buf.readInt16BE(8) / 10;
}

function decodeLongPebbleBeacon(buf, data) {
  data.highest24Pressure = buf.readInt16BE(2) / 10;
  data.average24Pressure = buf.readInt16BE(4) / 10;
  data.lowest24Pressure = buf.readInt16BE(6) / 10;
  data.altitude = buf.readInt16BE(8) / 10;
}
