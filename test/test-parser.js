import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert';
import { parseFollowing, parseFollowers, compareAccounts } from '../public/js/parser.js';

console.log('🧪 Running Instaboard Parser Tests...');

const followingJsonRaw = fs.readFileSync(path.resolve('sample-data/following.json'), 'utf-8');
const followersJsonRaw = fs.readFileSync(path.resolve('sample-data/followers_1.json'), 'utf-8');

// Test 1: Following parsing
const following = parseFollowing(followingJsonRaw);
console.log(`✓ Parsed following: ${following.length} accounts`);
assert.strictEqual(following.length, 25, 'Expected 25 following accounts in sample data');
assert.ok(following[0].username, 'Username should exist');
assert.ok(following[0].href.startsWith('https://www.instagram.com/'), 'Href should be valid Instagram URL');

// Test 2: Followers parsing
const followers = parseFollowers(followersJsonRaw);
console.log(`✓ Parsed followers: ${followers.length} accounts`);
assert.strictEqual(followers.length, 8, 'Expected 8 followers in sample data');

// Test 3: Comparison logic
const result = compareAccounts(following, followers);
console.log(`✓ Comparison result:`);
console.log(`  - Total Following: ${result.totalFollowing}`);
console.log(`  - Total Followers: ${result.totalFollowers}`);
console.log(`  - Mutual Count: ${result.mutualCount}`);
console.log(`  - Non-Followers: ${result.nonFollowersCount}`);

// Mutuals in our sample: artisan_coffee_roasters, beatrice_designer, fit_flow_fitness, kai_urban_runner, neon_night_vibes, sunset_chasers_club (6 mutuals)
// 25 following - 6 mutuals = 19 non-followers
assert.strictEqual(result.mutualCount, 6, 'Should have 6 mutuals');
assert.strictEqual(result.nonFollowersCount, 19, 'Should have 19 non-followers');

// Test 4: Alphabetical Sorting
for (let i = 0; i < result.nonFollowers.length - 1; i++) {
  const current = result.nonFollowers[i].username.toLowerCase();
  const next = result.nonFollowers[i + 1].username.toLowerCase();
  assert.ok(current <= next, `List should be sorted alphabetically: ${current} <= ${next}`);
}
console.log('✓ Alphabetical sort verified');

// Test 5: Zip Extraction
import JSZip from 'jszip';
import { extractZipData } from '../public/js/parser.js';

const zipBuffer = fs.readFileSync(path.resolve('sample-data/instagram-export-sample.zip'));
const zipExtracted = await extractZipData(zipBuffer, JSZip);
console.log(`✓ Zip extracted files:`, zipExtracted.fileNamesFound);
assert.strictEqual(zipExtracted.following.length, 25, 'Expected 25 following from zip');
assert.strictEqual(zipExtracted.followers.length, 8, 'Expected 8 followers from zip');

const zipComparison = compareAccounts(zipExtracted.following, zipExtracted.followers);
assert.strictEqual(zipComparison.nonFollowersCount, 19, 'Expected 19 non-followers from zip');
console.log('✓ Zip comparison matches direct JSON comparison');

console.log('🎉 All parser and zip extraction tests passed successfully!');
