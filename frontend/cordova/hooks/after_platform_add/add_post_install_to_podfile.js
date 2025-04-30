#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');

module.exports = function(context) {
    const platformPath = path.join(context.opts.projectRoot, 'platforms', 'ios');
    const podfilePath = path.join(platformPath, 'Podfile');
    const deploymentTarget = '12.0';
    const swiftVersion = '5.0';

    // Fixed post_install block with proper nesting of end statements
    const postInstallBlock = `post_install do |installer|
  installer.pods_project.targets.each do |target|
    puts "Processing Pod target: \${target.name}"
    target.build_configurations.each do |config|
      puts "  Configuration: \${config.name}"
      config.build_settings['IPHONEOS_DEPLOYMENT_TARGET'] = '${deploymentTarget}'
      puts "    Set IPHONEOS_DEPLOYMENT_TARGET to: \${config.build_settings['IPHONEOS_DEPLOYMENT_TARGET']}"
      config.build_settings['SWIFT_VERSION'] = '${swiftVersion}'
      puts "    Set SWIFT_VERSION to: \${config.build_settings['SWIFT_VERSION']}"
    end
    if target.respond_to?(:pod_target_xcconfig)
      target.pod_target_xcconfig.each do |config_name, xcconfig|
        puts "  XCConfig '\#{config_name}':"
        puts "    Original IPHONEOS_DEPLOYMENT_TARGET: \#{xcconfig['IPHONEOS_DEPLOYMENT_TARGET']}"
        xcconfig['IPHONEOS_DEPLOYMENT_TARGET'] = '${deploymentTarget}'
        puts "    Set IPHONEOS_DEPLOYMENT_TARGET to: \${xcconfig['IPHONEOS_DEPLOYMENT_TARGET']}"
      end
    else
      puts "  Target does not respond to pod_target_xcconfig."
    end
  end
end`;

    console.log(`Ensuring aggressive post_install hook in Podfile: ${podfilePath}`);

    return new Promise((resolve, reject) => {
        fs.readFile(podfilePath, 'utf8', (err, baseContent) => {
            if (err) {
                console.error('Error reading Podfile:', err);
                reject(err);
                return;
            }

            // First, remove any existing post_install blocks completely
            if (/post_install do \|installer\|[\s\S]*?end/g.test(baseContent)) {
                console.log('Already has a post install script continuing.')
                return
            }
            
            // Add a newline if the content doesn't end with one
            if (!baseContent.endsWith('\n')) {
                baseContent += '\n';
            }
            
            // Now add our post_install block
            const updatedData = baseContent + '\n' + postInstallBlock + '\n';
            
            console.log('Writing updated Podfile content...');
            
            fs.writeFile(podfilePath, updatedData, 'utf8', (writeErr) => {
                if (writeErr) {
                    console.error('Error writing updated Podfile:', writeErr);
                    reject(writeErr);
                    return;
                }
                console.log('Successfully updated Podfile.');

                console.log('Running pod install to apply changes...');
                exec('pod install', { cwd: platformPath }, (execErr, stdout, stderr) => {
                    if (execErr) {
                        console.error('Error running pod install:', execErr);
                        console.error('stdout:', stdout);
                        console.error('stderr:', stderr);
                        reject(execErr);
                        return;
                    }
                    console.log('pod install completed successfully.');
                    resolve();
                });
            });
        });
    });
};