// Print a systemd unit using this checkout, without installing files.
import path from 'node:path';
import {root,assetRoot} from '../catalog.mjs';
import {isIP} from 'node:net';
const host=process.env.PREVIEW_HOST;const port=Number(process.env.PREVIEW_PORT||4180);
if(isIP(host)!==4||!host.startsWith('100.')||Number(host.split('.')[1])<64||Number(host.split('.')[1])>127)throw new Error('Set PREVIEW_HOST to this machine’s Tailscale IP');
if(!Number.isInteger(port)||port<1||port>65535)throw new Error('Invalid port');
const quote=value=>'"'+value.replaceAll('\\','\\\\').replaceAll('"','\\"').replaceAll('%','%%')+'"';
console.log(`[Unit]
Description=Reusable private 3D model viewer
After=network-online.target tailscaled.service
Wants=network-online.target

[Service]
Type=simple
WorkingDirectory=${root.replaceAll('%','%%')}
Environment=${quote('PREVIEW_HOST='+host)}
Environment=PREVIEW_PORT=${port}
Environment=${quote('MODEL_ASSET_ROOT='+assetRoot())}
Environment=${quote('MODEL_CONFIG='+path.resolve(process.env.MODEL_CONFIG||path.join(root,'models.json')))}
ExecStart=${quote(process.execPath)} server.mjs
Restart=always
RestartSec=5
NoNewPrivileges=true
ProtectSystem=strict
PrivateTmp=true

[Install]
WantedBy=multi-user.target
`);
