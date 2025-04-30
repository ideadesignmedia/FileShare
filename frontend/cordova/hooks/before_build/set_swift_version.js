#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const xcode = require('xcode');

module.exports = function(context) {
    const platformPath = path.join(context.opts.projectRoot, 'platforms', 'ios');
    const packageJsonPath = path.join(context.opts.projectRoot, 'package.json');
    const deploymentTarget = '12.0';
    const swiftVersion = '5.0';

    let projectName;
    try {
        const packageJsonContent = fs.readFileSync(packageJsonPath, { encoding: 'utf-8' });
        const packageData = JSON.parse(packageJsonContent);
        projectName = packageData.displayName;
        if (!projectName) {
            console.warn('Warning: displayName not found in package.json. Using default project name.');
            projectName = context.opts.projectName;
        }
    } catch (error) {
        console.error('Error reading package.json:', error);
        projectName = context.opts.projectName;
    }

    const projectPath = path.join(platformPath, `${projectName}.xcodeproj/project.pbxproj`);

    console.log(`Ensuring Swift Language Version and Deployment Target for Xcode project: ${projectPath}`);

    try {
        const project = xcode.project(projectPath);
        project.parseSync();

        const configurationLists = project.hash.project.objects.XCConfigurationList || {};
        const buildConfigurations = project.hash.project.objects.XCBuildConfiguration || {};
        const nativeTargets = project.hash.project.objects.PBXNativeTarget || {};

        for (const targetKey in nativeTargets) {
            if (Object.prototype.hasOwnProperty.call(nativeTargets, targetKey)) {
                const target = nativeTargets[targetKey];
                if (target && target.isa === 'PBXNativeTarget' && target.buildConfigurationList) {
                    const configurationListID = target.buildConfigurationList;
                    const configurationList = configurationLists[configurationListID];

                    if (configurationList && configurationList.buildConfigurations) {
                        configurationList.buildConfigurations.forEach(configIDObject => { // Renamed to configIDObject for clarity
                            const configID = configIDObject.value; // Access the actual ID from the 'value' property
                            const config = buildConfigurations[configID];
                            if (config && config.buildSettings) {
                                console.log(`  Target Name: ${target.name}`);
                                console.log(`  Configuration Name: ${config.name}`);
                                const originalDeploymentTarget = config.buildSettings['IPHONEOS_DEPLOYMENT_TARGET'];
                                const originalSwiftVersion = config.buildSettings['SWIFT_VERSION'];

                                console.log(`    Original IPHONEOS_DEPLOYMENT_TARGET: ${typeof originalDeploymentTarget === 'object' ? JSON.stringify(originalDeploymentTarget) : originalDeploymentTarget}`);
                                config.buildSettings['IPHONEOS_DEPLOYMENT_TARGET'] = deploymentTarget.toString();
                                console.log(`    Set IPHONEOS_DEPLOYMENT_TARGET to: ${config.buildSettings['IPHONEOS_DEPLOYMENT_TARGET']}`);
                                console.log(`    Original SWIFT_VERSION: ${typeof originalSwiftVersion === 'object' ? JSON.stringify(originalSwiftVersion) : originalSwiftVersion}`);
                                config.buildSettings['SWIFT_VERSION'] = swiftVersion.toString();
                                console.log(`    Set SWIFT_VERSION to: ${config.buildSettings['SWIFT_VERSION']}`);
                            }
                        });
                    }
                }
            }
        }

        fs.writeFileSync(projectPath, project.writeSync());
        console.log('Successfully set Swift Language Version and Deployment Target for all native targets.');

    } catch (error) {
        console.error('Error setting Swift Language Version and Deployment Target in Xcode project:', error);
    }
};