/**
 * Instagram Data Export Parser
 * Implements exact parsing specifications for following.json & followers_1.json
 */

/**
 * Parses following.json content
 * Specification: Root key "relationships_following", username under "title", profile URL under "string_list_data[0].href"
 * @param {string|object} data 
 * @returns {Array<{username: string, href: string, timestamp: number|null}>}
 */
export function parseFollowing(data) {
  const json = typeof data === 'string' ? JSON.parse(data) : data;
  const entries = json?.relationships_following || (Array.isArray(json) ? json : []);

  if (!Array.isArray(entries)) {
    throw new Error('Invalid following.json: missing "relationships_following" array');
  }

  const result = [];
  const seen = new Set();

  for (const entry of entries) {
    if (!entry) continue;

    // Spec: Username is under "title", fallback to string_list_data[0].value
    const rawUsername = entry.title || entry.string_list_data?.[0]?.value || '';
    const username = String(rawUsername).trim();

    if (!username) continue;

    // Spec: Direct profile URL under "string_list_data[0].href"
    const href = entry.string_list_data?.[0]?.href || `https://www.instagram.com/${username}/`;
    const timestamp = entry.string_list_data?.[0]?.timestamp || null;

    const lower = username.toLowerCase();
    if (!seen.has(lower)) {
      seen.add(lower);
      result.push({
        username,
        href,
        timestamp: typeof timestamp === 'number' ? timestamp : null
      });
    }
  }

  return result;
}

/**
 * Parses followers_1.json content
 * Specification: Top-level array of user objects. Username at "string_list_data[0].value"
 * @param {string|object} data 
 * @returns {Array<{username: string, href: string, timestamp: number|null}>}
 */
export function parseFollowers(data) {
  const json = typeof data === 'string' ? JSON.parse(data) : data;
  const entries = Array.isArray(json) ? json : (json?.relationships_followers || []);

  if (!Array.isArray(entries)) {
    throw new Error('Invalid followers_1.json: expected top-level array of users');
  }

  const result = [];
  const seen = new Set();

  for (const entry of entries) {
    if (!entry) continue;

    // Spec: Username located at "string_list_data[0].value"
    const rawUsername = entry.string_list_data?.[0]?.value || entry.title || '';
    const username = String(rawUsername).trim();

    if (!username) continue;

    const href = entry.string_list_data?.[0]?.href || `https://www.instagram.com/${username}/`;
    const timestamp = entry.string_list_data?.[0]?.timestamp || null;

    const lower = username.toLowerCase();
    if (!seen.has(lower)) {
      seen.add(lower);
      result.push({
        username,
        href,
        timestamp: typeof timestamp === 'number' ? timestamp : null
      });
    }
  }

  return result;
}

/**
 * Compares following and followers to detect non-followers
 * Spec: map target accounts (following not present in followers) & sort alphabetically
 * @param {Array} followingList 
 * @param {Array} followersList 
 * @returns {{
 *   totalFollowing: number,
 *   totalFollowers: number,
 *   mutualCount: number,
 *   nonFollowersCount: number,
 *   nonFollowers: Array
 * }}
 */
export function compareAccounts(followingList, followersList) {
  const followerSet = new Set(
    followersList.map(f => f.username.toLowerCase().trim())
  );

  const nonFollowers = followingList
    .filter(target => !followerSet.has(target.username.toLowerCase().trim()))
    .sort((a, b) => a.username.localeCompare(b.username, undefined, { sensitivity: 'base' }));

  return {
    totalFollowing: followingList.length,
    totalFollowers: followersList.length,
    mutualCount: followingList.length - nonFollowers.length,
    nonFollowersCount: nonFollowers.length,
    nonFollowers
  };
}

/**
 * Extracts and parses following and followers directly from an Instagram export .zip file
 * Finds following.json and all followers_*.json files (including multi-part files)
 * @param {ArrayBuffer|Blob|File} zipData 
 * @param {object} [jszipInstance] Optional JSZip instance
 * @returns {Promise<{following: Array, followers: Array, fileNamesFound: Array}>}
 */
export async function extractZipData(zipData, jszipInstance) {
  const JSZipLib = jszipInstance || (typeof window !== 'undefined' ? window.JSZip : null);
  if (!JSZipLib) {
    throw new Error('JSZip library is not available');
  }

  const zip = await JSZipLib.loadAsync(zipData);
  const fileNames = Object.keys(zip.files);

  // Find following.json
  const followingPath = fileNames.find(name => 
    !zip.files[name].dir && /(^|\/)following\.json$/i.test(name)
  );

  // Find all followers_*.json or followers.json files
  const followersPaths = fileNames.filter(name => 
    !zip.files[name].dir && /(^|\/)followers(_\d+)?\.json$/i.test(name)
  );

  if (!followingPath) {
    throw new Error('Could not find "following.json" inside the uploaded zip archive.');
  }

  if (followersPaths.length === 0) {
    throw new Error('Could not find "followers_1.json" or "followers.json" inside the uploaded zip archive.');
  }

  // Parse following
  const followingRaw = await zip.files[followingPath].async('string');
  const following = parseFollowing(followingRaw);

  // Parse and merge all followers files (supports multi-part Instagram exports)
  let allFollowers = [];
  for (const fPath of followersPaths) {
    const followersRaw = await zip.files[fPath].async('string');
    const parsed = parseFollowers(followersRaw);
    allFollowers = allFollowers.concat(parsed);
  }

  // Deduplicate followers just in case
  const seen = new Set();
  const followers = [];
  for (const f of allFollowers) {
    const lower = f.username.toLowerCase();
    if (!seen.has(lower)) {
      seen.add(lower);
      followers.push(f);
    }
  }

  return {
    following,
    followers,
    fileNamesFound: [followingPath, ...followersPaths]
  };
}
