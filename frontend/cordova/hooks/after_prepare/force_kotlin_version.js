#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

module.exports = function (ctx) {
  const gradleFile = path.join(path.dirname(path.dirname(__dirname)), 'platforms/android/app/build.gradle');
  if (!fs.existsSync(gradleFile)) return console.log('gradle not found', gradleFile)

  let gradle = fs.readFileSync(gradleFile, 'utf8');

  // 1. Remove deprecated kotlin-android-extensions plugin
  gradle = gradle.replace(/(?:(?<=\n)|^) *apply plugin: 'kotlin-android-extensions'\n?/g, '');

  // 2. Ensure kotlin-parcelize is applied
  if (!gradle.includes("apply plugin: 'kotlin-parcelize'")) {
    gradle = gradle.replace(/apply plugin: 'kotlin-android'/, match => {
      return `${match}\napply plugin: 'kotlin-parcelize'`;
    });
  }

  // 3. Optional: Force Kotlin version ≥ 1.8.0 (uncomment if needed)
  // gradle = gradle.replace(/ext\.kotlin_version\s*=\s*['"](.+?)['"]/, "ext.kotlin_version = '1.8.22'");

  fs.writeFileSync(gradleFile, gradle);
  console.log('✅ Removed deprecated Kotlin plugin and ensured kotlin-parcelize is applied.');
};