import assert from "node:assert/strict";
import { allowed } from "./pro.js";
assert.equal(allowed("", ""), true, "no checkout url = free");
assert.equal(allowed("https://x.lemonsqueezy.com/buy/1", ""), false, "url set, no key = gated");
assert.equal(allowed("https://x.lemonsqueezy.com/buy/1", "KEY"), true, "url set, key = allowed");
console.log("pro ok");
