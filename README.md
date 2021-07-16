# Hue bridge Emulator
[![license](https://img.shields.io/badge/license-MPL--2.0-blue.svg)](LICENSE)

Emulate a hue bridge to interface with hue compatible devices like the Amazon Echo.

This started life as a fork of https://github.com/tim-hellhake/hue-bridge-emulator, but has diverged substantially.

Features include
  - A device database to emulate different kinds of devices
  - UPNP on/off on the fly
  - Ability to set the Hue ID on a per device basis to avoid re-ordering and clashes.
  - device profile fine-tuning

# How to use
See `./examples/color-bulb.js` for a basic example, and `./examples/huectrl-server.js` for a more advanced one.

Check out https://github.com/krishna-v/homecontrol for a home automation system that uses this code.
