#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const mode = process.argv[2];
if (!mode || !['dev', 'prod'].includes(mode)) {
  console.error('Usage: node scripts/toggle-package-id.js [dev|prod]');
  process.exit(1);
}

const appJsonPath = path.resolve(__dirname, '../app.json');
const appJson = JSON.parse(fs.readFileSync(appJsonPath, 'utf8'));

const devValues = {
  android: {
    package: 'com.akpgreentree.reader.dev',
    versionCode: 7,
  },
  ios: {
    bundleIdentifier: 'com.akpgreentree.reader.dev',
  },
};

const prodValues = {
  android: {
    package: 'com.akpgreentree.reader',
    versionCode: 7,
  },
  ios: {
    bundleIdentifier: 'com.akpgreentree.reader',
  },
};

appJson.expo.android = {
  ...appJson.expo.android,
  ... (mode === 'dev' ? devValues.android : prodValues.android),
};
appJson.expo.ios = {
  ...appJson.expo.ios,
  ... (mode === 'dev' ? devValues.ios : prodValues.ios),
};

fs.writeFileSync(appJsonPath, JSON.stringify(appJson, null, 2) + '\n');
console.log(`Set app.json to ${mode} package IDs.`);
