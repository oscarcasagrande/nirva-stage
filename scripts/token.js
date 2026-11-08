#!/usr/bin/env node
'use strict';
// Gera um token aleatório para o NIRVA_TOKEN: 192 bits em base64url (32 caracteres).
//   npm run -s token
const crypto = require('crypto');
console.log(crypto.randomBytes(24).toString('base64url'));
