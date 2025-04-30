#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const xcode = require('xcode');

module.exports = function(context) {
    const platformPath = path.join(context.opts.projectRoot, 'platforms', 'ios');
    const cordovaLibProjectPath = path.join(platformPath, 'CordovaLib/CordovaLib.xcodeproj/project.pbxproj');
    const deploymentTarget = '12.0';

    console.log(`Ensuring IPHONEOS_DEPLOYMENT_TARGET for CordovaLib project: ${cordovaLibProjectPath}`);

    return new Promise((resolve, reject) => {
        try {
            const project = xcode.project(cordovaLibProjectPath);
            project.parseSync();

            const buildSettings = project.pbxXCBuildConfigurationSection();
            for (const key in buildSettings) {
                if (Object.prototype.hasOwnProperty.call(buildSettings, key)) {
                    const buildConfig = buildSettings[key];
                    if (typeof buildConfig === 'object' && buildConfig !== null && buildConfig.buildSettings) {
                        console.log(`  Setting IPHONEOS_DEPLOYMENT_TARGET for CordovaLib config: ${buildConfig.name}`);
                        buildConfig.buildSettings['IPHONEOS_DEPLOYMENT_TARGET'] = `"${deploymentTarget}"`;
                    }
                }
            }

            fs.writeFileSync(cordovaLibProjectPath, project.writeSync());
            console.log('Successfully set IPHONEOS_DEPLOYMENT_TARGET for CordovaLib.');
            resolve();

        } catch (error) {
            console.error('Error setting IPHONEOS_DEPLOYMENT_TARGET in CordovaLib project:', error);
            reject(error);
        }
    });
};