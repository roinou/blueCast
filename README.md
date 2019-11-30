BlueCast
========

BlueCast brings [Blue Maestro](https://bluemaestro.com/home) sensors to MQTT.
It will discover BLE devices and report to MQTT valid readings.


## Prerequisites

BlueCast depends on [Noble](https://github.com/abandonware/noble) and MQTT. Refer to Noble project for advance installation instructions.


## How does it works?

In order to preserve resources, discovery of BLE devices is only run after a message is received on a control topic: `$bluecastTopic/ctl`.
Discovery will run for a certain amount of time, and all valid readings will be published to relevant topics.


### Readings

Given Noble and BlueZ separate the scan request and scan response data, 2 types of messages can be read:

- **scan request**: contains instant readings, such as temperature, humidity, dew point
- **scan response**: contains statistic data, such as min/max and 24h average

Full reading will be published in a JSON object, e.g.:

```
{
	"data": {
		"battery": 100,
		"breachCount": 0,
		"humidity": 92.3,
		"mode": 53,
		"temperature": 6.2,
		"timeInterval": 3600,
		"timeIntervalPosition": 6000,
		"version": 27
	},
	"name": "terasse",
	"timestamp": "2019-11-30T14:09:59.175Z",
	"version": 27
}
```
```
{
	"data": {
		"average24Temperature": 19.8,
		"average24humidity": 45.7,
		"globalIdentifier": 0,
		"highest24Humidity": 49.4,
		"highest24Temperature": 20.6,
		"highestHumidity": 79.8,
		"highestTemperature": 29.9,
		"lowest24Humidity": 41.7,
		"lowest24Temperature": 19.3,
		"lowestHumidity": 37,
		"lowestTemperature": 18,
		"referenceData": 1811072320
	},
	"name": "living",
	"timestamp": "2019-11-30T14:09:58.580Z",
	"version": 23
}
```

But individual readings will be put in specific topics:
`$bluecastTopic/$sensorName/temperature`, `$bluecastTopic/$sensorName/humidity`, `$bluecastTopic/$sensorName/battery`


## Configuration

The following environment properties configure BlueCast:

- **MQTT_HOST**: the mqtt hostname
- **TOPIC_NAME**: the base name for the MQTT topic
- **SCAN_TIME**: the amount in time, in milliseconds, to run discovery when message received on topic
- **DEBUG** `info|debug`: log level (comma separated)
- **NOBLE_REPORT_ALL_HCI_EVENTS**: if 1, will report both scan request and scan response (needed on Raspberry Pi)


## Installation

In order to install as service, create the following environment file `/etc/default/bluecast`:
```
NOBLE_REPORT_ALL_HCI_EVENTS=1

DEBUG=info

## Default values
#MQTT_HOST=localhost
#TOPIC_NAME=sensor
#SCAN_TIME=5000
```

Create a system user: `sudo useradd -m --system bluecast`

And the following service file `/etc/systemd/system/bluecast.service`:
```
[Unit]
Description=BlueCast
After=syslog.target network-online.target

[Service]
Type=simple
User=bluecast
EnvironmentFile=/etc/default/bluecast
WorkingDirectory=/home/pi/project/bluecast
ExecStart=/usr/bin/node index.js
Restart=on-failure
RestartSec=3
KillMode=process

[Install]
WantedBy=multi-user.target
```

And enable the service: `sudo systemctl daemon-reload; sudo systemctl enable bluecast; sudo systemctl start bluecast`

And check the logs: `sudo journalctl -f -n 200 -u bluecast`


### Application

This project can be used in conjunction with [homebridge](https://github.com/nfarina/homebridge) and plugins
[homebridge-mqtt-temperature](https://github.com/mcchots/homebridge-mqtt-temperature) and
[homebridge-mqtt-humidity](https://github.com/mcchots/homebridge-mqtt-humidity) with the following config:

```
"accessories": [
	{
		"accessory": "mqtt-temperature",
		"name": "Pupuce Temperature",
		"url": "mqtt://centralpi",
		"topic": "sensor/pupuce/temperature",
		"batt_topic": "sensor/pupuce/battery",
		"refresh_topic": "sensor/ctl"
	},
	{
		"accessory": "mqtt-humidity",
		"name": "Studio Humidity",
		"url": "mqtt://centralpi",
		"topic": "sensor/studio/humidity",
		"batt_topic": "sensor/studio/battery",
		"refresh_topic": "sensor/ctl"
	},
]
```