/**
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

const os = require('os');
const express = require('express');
const bodyParser = require('body-parser');

const DEFAULT_DEVICE = './hue-color-lamp.json';

let _debug = false;

function debug(log) {
    if (_debug) {
        console.log(log);
    }
}

function getIpAddress() {
    const networkInterfaces = os.networkInterfaces();

    for (const name in networkInterfaces) {
        const networkInterface = networkInterfaces[name];

        for (const subInterfaceName in networkInterface) {
            const subInterface = networkInterface[subInterfaceName];

            if (subInterface.family == 'IPv4' && subInterface.internal == false) {
                debug(`Found ip address ${subInterface.address}`);
                return subInterface.address;
            }
        }
    }

    throw 'No ip address found';
}

class HueUPNPServer {
    constructor(ipAddress, port, descriptionPath, bridgeId, uuid) {
        this.ipAddress = ipAddress;
        this.port = port;
        this.descriptionPath = descriptionPath;
        this.bridgeId = bridgeId;
        this.uuid = uuid;
        this.socket = null;
    }

    start() {
        const dgram = require('dgram');
        this.socket = dgram.createSocket({ type: 'udp4', reuseAddr: true });

        this.socket.on('message', (msg, rinfo) => {
            if (msg.indexOf('M-SEARCH') >= 0) {
                debug(`Received M-SEARCH from ${rinfo.address}:${rinfo.port}`);
                const uin = `uuid:${this.uuid}`;

                this.socket.send(this.createResponse(this.ipAddress, this.port, this.descriptionPath, this.bridgeId,
                    'upnp:rootdevice', `${uin}::upnp:rootdevice`
                ), rinfo.port, rinfo.address, (error) => {
                    if (error) {
                        console.error(error);
                    }
                });
                this.socket.send(this.createResponse(this.ipAddress, this.port, this.descriptionPath, this.bridgeId,
                    uin, uin
                ), rinfo.port, rinfo.address, (error) => {
                    if (error) {
                        console.error(error);
                    }
                });
                this.socket.send(this.createResponse(this.ipAddress, this.port, this.descriptionPath, this.bridgeId,
                    'urn:schemas-upnp-org:device:basic:1', uin
                ), rinfo.port, rinfo.address, (error) => {
                    if (error) {
                        console.error(error);
                    }
                });
            }
        });

        this.socket.on('listening', () => {
            const address = this.socket.address();
            console.log(`Discovery is listening on ${address.address}:${address.port}`);
        });

        this.socket.bind(1900, () => {
            this.socket.addMembership('239.255.255.250');
        });
    }

    stop() {
        if(this.socket) {
            this.socket.close();
            this.socket = null;
        }
    }

    createResponse(ip, port, path, bridgeid, st, usn) {
        return `HTTP/1.1 200 OK
HOST: 239.255.255.250:1900
EXT:
CACHE-CONTROL: max-age=100
LOCATION: http://${ip}:${port}${path}
SERVER: Linux/3.14.0 UPnP/1.0 IpBridge/1.29.0
hue-bridgeid: ${bridgeid}
ST: ${st}
USN: ${usn}
    
    `.replace(new RegExp('\n', 'g'), '\r\n');
    }
}

class HueBridgeEmulator {

    constructor(conf = null) {
        this.devicedb = "./devicedb";
        this.port = 80;
        this.lights = {};
        this.callbacks = {};
        this.models = {};
        this.globalcb = null;
        this.models['default'] = require(DEFAULT_DEVICE);
        this.discoveryServer = null;
        this.doUPNP = true;

        const prefix = '001788';
        const postfix = '7ebe7d';
        this.descriptionPath = '/description.xml';
        this.serialNumber = `${prefix}${postfix}`;
        this.bridgeId = `${prefix}FFFE${postfix}`;
        this.uuid = `2f402f80-da50-11e1-9b23-${this.serialNumber}`;
        this.ipAddress = getIpAddress();

        if(!conf) return;
        
        debug("Found Config...");
        if(conf.debug !== undefined) _debug = conf.debug;
        if(conf.port) this.port = conf.port;
        if(conf.callback) this.globalcb = conf.callback;
        if(conf.devicedb) this.devicedb = conf.devicedb;
        if(conf.upnp !== undefined) this.doUPNP = conf.upnp;
    }

    start() {

        const app = express();
        app.use(bodyParser.json());
        app.use(bodyParser.urlencoded({ extended: true }));

        app.use((req, res, next) => {
            debug(`${req.ip} ${req.method} ${req.originalUrl}`);
            next();
        });

        app.get(this.descriptionPath, (req, res) => {
            res.status(200).send(this.createDescription(this.ipAddress, this.port, this.serialNumber, this.uuid));
        });

        app.post('/api', (req, res) => {
            const result = [{ success: { username: 'foo' } }];
            res.status(200).contentType('application/json').send(JSON.stringify(result));
        });

        app.get('/api/foo/lights', (req, res) => {
            res.status(200).contentType('application/json').send(JSON.stringify(this.lights));
        });

        app.get('/api/foo/lights/:id', (req, res) => {
            const light = this.lights[req.params.id];

            if (light) {
                res.status(200)
                    .contentType('application/json')
                    .send(JSON.stringify(light));
            } else {
                res.status(404).send();
            }
        });

        app.put('/api/foo/lights/:id/state', (req, res) => {
            const id = req.params.id;
            const light = this.lights[id];
            const callback = this.callbacks[id];
            const state = req.body;
            debug(`Received state change ${JSON.stringify(state, 1)}`);

            if (light) {
                const result = [];
                if(this.globalcb) {
                    this.globalcb(this, id, light, state);
                }

                for (let key in state) {
                    const value = state[key];

                    if (callback) {
                        try {
                            callback(key, value);
                        } catch (err) {
                            console.error(err);
                        }
                    }
                    // Global callback will process state updates.
                    if(!this.globalcb) light.state[key] = value;
                    result.push({ success: { [`/lights/${id}/state/${key}`]: value } });
                }
                // TODO: Mechanism to allow callback to set an error condition?
                res.status(200).contentType('application/json').send(JSON.stringify(result));
            } else {
                res.status(404).send();
            }
        });

        const restServer = app.listen(this.port, () => {
            console.log(`Api is listening on ${restServer.address().address}:${restServer.address().port}`);
        });

        if(this.doUPNP) this.startUPNP();
    }

    startUPNP() {
        debug("Starting UPNP Server...");
        if(this.discoveryServer) return;
        this.discoveryServer = new HueUPNPServer(this.ipAddress, this.port, this.descriptionPath, this.bridgeId, this.uuid);
        this.discoveryServer.start();
    }

    stopUPNP() {
        debug("Stopping UPNP Server...");
        if(this.discoveryServer) {
            this.discoveryServer.stop();
            this.discoveryServer = null;
        }
    }
    

    addLight(name, onChange) {
        const nextId = Object.keys(this.lights).length + 1;
        let light = null;

        if(typeof name === "string") {
            light = JSON.parse(JSON.stringify(this.models['default']));
            light.name = name;
        } else light = this.newLight(nextId, name);
        this.lights[nextId] = light;
        debug(`Added light with name ${light.name} as ID ${nextId}`);

        if (onChange) this.callbacks[nextId] = onChange;
        return nextId;
    }

    newLight(id, info) {
        let light = null;
        let modelname = 'default';
        if(info.model) {
            modelname = info.model;
            if(!this.models[modelname]) {
                const filename = `${this.devicedb}/${modelname}.json`;
                try {
                    this.models[modelname] = require(filename);
                    light = JSON.parse(JSON.stringify(this.models[modelname]));
                } catch (err) {
                    console.log(`Error loading ${filename}. Using default model`);
                    modelname = 'default';
                }
            }
        }
        light = JSON.parse(JSON.stringify(this.models[modelname]));

        light.name = (info.name) ? info.name : `light-${id}`;
        if(info.override) Object.assign(light, info.override);
        return light;
    }

    setState(id, state) {
        const light = this.lights[id];
        if(!light) return;

        for(let key in state) light.state[key] = state[key];
    }

    createDescription(ip, port, serialNumber, uuid) {
        return `<?xml version='1.0' encoding='UTF-8' ?>
<root xmlns='urn:schemas-upnp-org:device-1-0'>
<specVersion>
<major>1</major>
<minor>0</minor>
</specVersion>
<URLBase>http://${ip}:${port}/</URLBase>
<device>
<deviceType>urn:schemas-upnp-org:device:Basic:1</deviceType>
<friendlyName>Philips hue (${ip})</friendlyName>
<manufacturer>Royal Philips Electronics</manufacturer>
<manufacturerURL>http://www.philips.com</manufacturerURL>
<modelDescription>Philips hue Personal Wireless Lighting</modelDescription>
<modelName>Philips hue bridge 2015</modelName>
<modelNumber>BSB002</modelNumber>
<modelURL>http://www.meethue.com</modelURL>
<serialNumber>${serialNumber}</serialNumber>
<UDN>uuid:${uuid}</UDN>
<presentationURL>index.html</presentationURL>
<iconList>
<icon>
<mimetype>image/png</mimetype>
<height>48</height>
<width>48</width>
<depth>24</depth>
<url>hue_logo_0.png</url>
</icon>
</iconList>
</device>
</root>
    `.replace(new RegExp('\n', 'g'), '\r\n');
    }
}


module.exports = HueBridgeEmulator;
