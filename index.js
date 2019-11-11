const noble = require('noble-mac');
const scanningTimeout = 15000; // one second
const scanningRepeat = scanningTimeout + 5000; // Repeat scanning after 10 seconds for new peripherals.

const mqtt = require('mqtt');
const client = mqtt.connect('mqtt://centralpi');

const devices = [
  'terasse',
  'pupuce'/*,
  'studio',
  'salon'*/
];

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
  const localName = advertisement.localName;
  // var txPowerLevel = advertisement.txPowerLevel;
  const manufacturerData = advertisement.manufacturerData;
  // var serviceData = advertisement.serviceData;
  // var serviceUuids = advertisement.serviceUuids;
  if (isDeviceCompatible(advertisement)) {
    console.log('Found peripheral:', localName);
    console.log(peripheral);
    console.log(advertisement);
    // // console.log(peripheral.id + ', ' + serviceData + ', ' + serviceUuids + ', ' + txPowerLevel);
    // console.log(peripheral.id + ', ' + peripheral.address);
    // //console.log(peripheral);
    // console.log(manufacturerData);
    console.log(manufacturerData.toString('hex'));
    decodeTempo(manufacturerData, localName);
  }
}); // End on Noble Discover!

/**
 * checks if device starts with 33 01 i.e. it's a blue maestro device
 * @param advertisement
 */
function isDeviceCompatible(advertisement) {
  if (advertisement && advertisement.manufacturerData && advertisement.manufacturerData.length > 2) {
    // console.log(advertisement.manufacturerData.hexSlice(0, 2));
    // fixme magic ID
    return advertisement.manufacturerData.slice(0, 2).toString('hex') === "3301";
  }
  return false;
}

function decodeTempo(buf, localName) {
  const data = {};
  //console.log('buffer length:', buf.length);
  if (buf.length <= 16) {
    data.version = buf.readUInt8(2);
    data.battery = buf.readUInt8(3);
    data.timeInterval = buf.readUInt16BE(4);
    data.timeIntervalPosition = buf.readUInt16BE(6);
    data.temperature = buf.readInt16BE(8) / 10;
    data.humidity = buf.readInt16BE(10) / 10;
    data.dewPoint = buf.readInt16BE(12) / 10;
  } else {
    data.highestTemperature = buf.readInt16BE(2) / 10;
    data.highestHumidity = buf.readInt16BE(4) / 10;
    data.lowestTemperature = buf.readInt16BE(6) / 10;
    data.lowestHumidity = buf.readInt16BE(8) / 10;
    data.highest24Temperature = buf.readInt16BE(10) / 10;
    data.highest24Humidity = buf.readInt16BE(12) / 10;
    data.lowest24Temperature = buf.readInt16BE(14) / 10;
    data.lowest24Humidity = buf.readInt16BE(16) / 10;
    data.average24Temperature = buf.readInt16BE(18) / 10;
    data.average24humidity = buf.readInt16BE(20) / 10;
    data.data1 = buf.readInt16BE(22) / 10;
    data.data2 = buf.readInt16BE(24) / 10;
  }
  const wrapper = {
    timestamp: new Date(),
    name: localName,
    data: data
  };
  client.publish('sensor', JSON.stringify(wrapper));
  console.log(data);
}

