/**
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.*
 */
const HueBridgeEmulator = require('../hue-bridge-emulator');

const housemap = {
    rooms: {
        '1': { 
            name: 'Living Room',
            ctrls: {
                '1': { name: 'Ceiling Light', type: 'LIGHT' },
                '2': { name: 'Fan', type: 'FAN' },
                '3': { name: 'Accent Light', type: 'SMARTLIGHT' }
            }
        },
        '2': { 
            name: 'Master Bedroom',
            ctrls: {
                '1': { name: 'Ceiling Light', type: 'LIGHT' },
                '2': { name: 'Fan', type: 'FAN' },
                '3': { name: 'Water Heater', type: 'HEATER' },
                '4': { name: 'Table Lamp', type: 'SMARTLIGHT' }
            }
        },
        '3': { 
            name: 'Guest Bedroom',
            ctrls: {
                '1': { name: 'Ceiling Light', type: 'LIGHT' },
                '2': { name: 'Fan', type: 'FAN' },
                '3': { name: 'Water Heater', type: 'HEATER' }
            }
        }
    }
};

const hueDevices = {};

/** Parameters:
 *  hbe:    reference to the HueBridgeEmulator object
 *  id:     device id returned by addDevice()
 *  device: device struct as managed by the HueBridgeEmulator
 *  state:  new state passed in from request.
 */ 
function hueCallback(hbe, id, device, state) {
    const dev = hueDevices[id];
    if(!dev) return;
    console.log(`${housemap.rooms[dev.room].ctrls[dev.ctrl].name} in the ${housemap.rooms[dev.room].name} was turned ${state.on ? 'on' : 'off'}`);
    hbe.setState(id, state);
}

const hueBridgeEmulator = new HueBridgeEmulator({ port: 8080, debug: true, devicedb: './devicedb', callback: hueCallback });

function loadAppliances(map) {
    for(let room in map.rooms) {
        for(let ctrl in map.rooms[room].ctrls) {
            const type = map.rooms[room].ctrls[ctrl].type;
            if (!['LIGHT', 'FAN', 'HEATER', 'SMARTLIGHT'].includes(type)) continue;
            const lightspec = {};
            // Friendly name for the light as shown by the bridge.
            lightspec.name = `${map.rooms[room].name} ${map.rooms[room].ctrls[ctrl].name}`;
            // Set a light model to emulate (load json from the devicedb directory.)
            if(type == 'SMARTLIGHT') lightspec.model = 'LCT016';
            else if(type == 'LIGHT') lightspec.model = 'LWB006';
            else lightspec.model = 'LOM001';
            // Override parts of the loaded model spec to customize the device.
            lightspec.override = { uniqueid: `00:17:88:01:${room.padStart(2,'0')}:${ctrl.padStart(2,'0')}:01:01-0b` };
            const id = hueBridgeEmulator.addDevice(lightspec);
            hueDevices[id] = { 'room': room, 'ctrl': ctrl };
        }
    }
}

loadAppliances(housemap);
hueBridgeEmulator.start();
