const noble = require('@abandonware/noble');
const debug = require('debug')('debug');
const info = require('debug')('info');

const MQTT_HOST = process.env.MQTT_HOST ? process.env.MQTT_HOST : 'localhost';
const TOPIC = process.env.TOPIC_NAME ? process.env.TOPIC_NAME : 'sensor';
const CTL_TOPIC = TOPIC + '/ctl';

const DEFAULT_SCAN_TIME = process.env.SCAN_TIME ? process.env.SCAN_TIME : 5000;

const mqtt = require('mqtt');
const client = mqtt.connect('mqtt://' + MQTT_HOST);

// mappings per manufacturer, then per version
const DEVICE_MAPPINGS = {
  '3301': {
    '23': {
      metrics: ['battery', 'humidity', 'temperature']
    },
    '27': {
      metrics: ['battery', 'humidity', 'temperature', 'pressure']
    }
  }
};

client.on('connect', () => {
  client.subscribe(CTL_TOPIC, function (err, granted) {
    if (err == null)
      info('control topic subscribed:', granted);
    else
      info('could not subscribe to control topic:', err);
  });
});

let isScanning = false;

client.on('message', (topic, msg) => {
  if (topic === CTL_TOPIC) {
    debug('received control message:', msg);
    if (noble.state === 'poweredOn' && !isScanning) {
      debug('start scanning');
      noble.startScanning([], true);
      isScanning = true;
      setTimeout(function () {
        debug('stopping scan');
        noble.stopScanning();
        isScanning = false;
      }, DEFAULT_SCAN_TIME);
    }
  }
});

// needed to force Noble to init state
noble.on('stateChange', function(state) {
  info('state changed: ' + state);
});

noble.on('discover', function(peripheral) {
  const advertisement = peripheral.advertisement;
  const manufacturerData = advertisement.manufacturerData;
  const mapping = DEVICE_MAPPINGS[extractManufacturerData(advertisement)];
  if (mapping !== undefined) {
    debug('Found peripheral:', advertisement.localName, peripheral.uuid);
    debug(manufacturerData.toString('hex'));
    const desc = fetchDeviceDescription(peripheral);
    if (desc) {
      const data = decodeTempo(manufacturerData, desc);
      publish(data, mapping[data.version]);
    }
  }
}); // End on Noble Discover!

function publish(data, mappings) {
  debug("publishing data");
  client.publish(TOPIC, JSON.stringify(data),
    function(err) {if (err) info(err);});
  if (mappings && mappings.metrics) {
    publishMetric(data, mappings.metrics);
  }
}

function publishMetric(data, metrics) {
  metrics.forEach(metric => {
    if (data.data && data.data[metric])
      client.publish(TOPIC + '/' + data.name + '/' + metric, "" + data.data[metric]);
  });
}

/**
 * checks if device starts with 33 01 i.e. it's a blue maestro device
 * @param advertisement
 */
function extractManufacturerData(advertisement) {
  if (advertisement && advertisement.manufacturerData && advertisement.manufacturerData.length > 2) {
    // fixme magic ID
    return advertisement.manufacturerData.slice(0, 2).toString('hex');
  }
  return "";
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
    const desc = {
      label: adv.localName,
      version: adv.manufacturerData.readUInt8(2)
    };
    info('found and registered:', desc);
    return desc;
  }
  return undefined;
}

function decodeTempo(buf, description) {
  const data = {};
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
  } else if (description.version === 27) {
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
