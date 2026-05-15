"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __generator = (this && this.__generator) || function (thisArg, body) {
    var _ = { label: 0, sent: function() { if (t[0] & 1) throw t[1]; return t[1]; }, trys: [], ops: [] }, f, y, t, g = Object.create((typeof Iterator === "function" ? Iterator : Object).prototype);
    return g.next = verb(0), g["throw"] = verb(1), g["return"] = verb(2), typeof Symbol === "function" && (g[Symbol.iterator] = function() { return this; }), g;
    function verb(n) { return function (v) { return step([n, v]); }; }
    function step(op) {
        if (f) throw new TypeError("Generator is already executing.");
        while (g && (g = 0, op[0] && (_ = 0)), _) try {
            if (f = 1, y && (t = op[0] & 2 ? y["return"] : op[0] ? y["throw"] || ((t = y["return"]) && t.call(y), 0) : y.next) && !(t = t.call(y, op[1])).done) return t;
            if (y = 0, t) op = [op[0] & 2, t.value];
            switch (op[0]) {
                case 0: case 1: t = op; break;
                case 4: _.label++; return { value: op[1], done: false };
                case 5: _.label++; y = op[1]; op = [0]; continue;
                case 7: op = _.ops.pop(); _.trys.pop(); continue;
                default:
                    if (!(t = _.trys, t = t.length > 0 && t[t.length - 1]) && (op[0] === 6 || op[0] === 2)) { _ = 0; continue; }
                    if (op[0] === 3 && (!t || (op[1] > t[0] && op[1] < t[3]))) { _.label = op[1]; break; }
                    if (op[0] === 6 && _.label < t[1]) { _.label = t[1]; t = op; break; }
                    if (t && _.label < t[2]) { _.label = t[2]; _.ops.push(op); break; }
                    if (t[2]) _.ops.pop();
                    _.trys.pop(); continue;
            }
            op = body.call(thisArg, _);
        } catch (e) { op = [6, e]; y = 0; } finally { f = t = 0; }
        if (op[0] & 5) throw op[1]; return { value: op[0] ? op[1] : void 0, done: true };
    }
};
Object.defineProperty(exports, "__esModule", { value: true });
var playwright_1 = require("playwright");
var node_fs_1 = require("node:fs");
var jsqr_1 = require("jsqr");
var pngjs_1 = require("pngjs");
var qrcode_terminal_1 = require("qrcode-terminal");
function decodeQrFromBase64(base64) {
    var _a;
    try {
        var buf = Buffer.from(base64, 'base64');
        var png = pngjs_1.PNG.sync.read(buf);
        var code = (0, jsqr_1.default)(new Uint8ClampedArray(png.data), png.width, png.height);
        return (_a = code === null || code === void 0 ? void 0 : code.data) !== null && _a !== void 0 ? _a : null;
    }
    catch (_b) {
        return null;
    }
}
function extractToken(data) {
    var m = data.match(/tk=([^&]+)/);
    return m ? m[1] : data.slice(-40);
}
function extractQrData(page) {
    return __awaiter(this, void 0, void 0, function () {
        var canvases, n, i, dataUrl, b64, d, _a, imgs, n, i, src, b64, d, _b;
        return __generator(this, function (_c) {
            switch (_c.label) {
                case 0:
                    _c.trys.push([0, 6, , 7]);
                    canvases = page.locator('canvas');
                    return [4 /*yield*/, canvases.count()];
                case 1:
                    n = _c.sent();
                    i = 0;
                    _c.label = 2;
                case 2:
                    if (!(i < n)) return [3 /*break*/, 5];
                    return [4 /*yield*/, canvases.nth(i).evaluate(function (el) { return el.toDataURL('image/png'); })];
                case 3:
                    dataUrl = _c.sent();
                    if (dataUrl === null || dataUrl === void 0 ? void 0 : dataUrl.startsWith('data:image')) {
                        b64 = dataUrl.replace(/^data:image\/\w+;base64,/, '');
                        d = decodeQrFromBase64(b64);
                        if (d)
                            return [2 /*return*/, { data: d, source: "canvas[".concat(i, "]") }];
                    }
                    _c.label = 4;
                case 4:
                    i++;
                    return [3 /*break*/, 2];
                case 5: return [3 /*break*/, 7];
                case 6:
                    _a = _c.sent();
                    return [3 /*break*/, 7];
                case 7:
                    _c.trys.push([7, 13, , 14]);
                    imgs = page.locator('img');
                    return [4 /*yield*/, imgs.count()];
                case 8:
                    n = _c.sent();
                    i = 0;
                    _c.label = 9;
                case 9:
                    if (!(i < n)) return [3 /*break*/, 12];
                    return [4 /*yield*/, imgs.nth(i).getAttribute('src')];
                case 10:
                    src = _c.sent();
                    if (src === null || src === void 0 ? void 0 : src.startsWith('data:image')) {
                        b64 = src.replace(/^data:image\/\w+;base64,/, '');
                        d = decodeQrFromBase64(b64);
                        if (d)
                            return [2 /*return*/, { data: d, source: "img[".concat(i, "]") }];
                    }
                    _c.label = 11;
                case 11:
                    i++;
                    return [3 /*break*/, 9];
                case 12: return [3 /*break*/, 14];
                case 13:
                    _b = _c.sent();
                    return [3 /*break*/, 14];
                case 14: return [2 /*return*/, null];
            }
        });
    });
}
function renderQr(data) {
    return __awaiter(this, void 0, void 0, function () {
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, new Promise(function (resolve) {
                        qrcode_terminal_1.default.generate(data, { small: true }, function (qr) {
                            process.stdout.write(qr + '\n');
                            resolve();
                        });
                    })];
                case 1:
                    _a.sent();
                    return [2 /*return*/];
            }
        });
    });
}
function main() {
    return __awaiter(this, void 0, void 0, function () {
        var browser, context, page, _a, lastToken, stableCount, qrFound, scanStart, cookies, _b, qr, newToken, changed, sec, sec, _c, _d, _e, _f;
        return __generator(this, function (_g) {
            switch (_g.label) {
                case 0:
                    console.log('\n🚀 Đang mở trình duyệt...\n');
                    return [4 /*yield*/, playwright_1.chromium.launch({
                            headless: true,
                            executablePath: '/home/leco/.cache/ms-playwright/chromium-1223/chrome-linux64/chrome',
                            args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu'],
                        })];
                case 1:
                    browser = _g.sent();
                    return [4 /*yield*/, browser.newContext({
                            userAgent: 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36',
                            viewport: { width: 1280, height: 800 },
                            locale: 'vi-VN',
                            timezoneId: 'Asia/Ho_Chi_Minh',
                        })];
                case 2:
                    context = _g.sent();
                    return [4 /*yield*/, context.newPage()];
                case 3:
                    page = _g.sent();
                    return [4 /*yield*/, page.addInitScript(function () {
                            Object.defineProperty(navigator, 'webdriver', { get: function () { return false; } });
                        })];
                case 4:
                    _g.sent();
                    console.log('📄 Đang load chat.zalo.me...');
                    return [4 /*yield*/, page.goto('https://chat.zalo.me/', { waitUntil: 'domcontentloaded', timeout: 30000 })];
                case 5:
                    _g.sent();
                    // Chờ QR xuất hiện đầu tiên
                    console.log('⏳ Chờ QR đầu tiên...');
                    _g.label = 6;
                case 6:
                    _g.trys.push([6, 8, , 9]);
                    return [4 /*yield*/, page.waitForSelector('div[class*="qr"], canvas, img[src*="qr"]', { timeout: 15000 })];
                case 7:
                    _g.sent();
                    return [3 /*break*/, 9];
                case 8:
                    _a = _g.sent();
                    console.log('⚠️  Không thấy QR element');
                    return [3 /*break*/, 9];
                case 9:
                    lastToken = '';
                    stableCount = 0;
                    qrFound = false;
                    scanStart = Date.now();
                    console.log('\n🔍 BẮT ĐẦU THEO DÕI QR THAY ĐỔI');
                    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
                    _g.label = 10;
                case 10:
                    if (!(Date.now() - scanStart < 90000)) return [3 /*break*/, 26];
                    _g.label = 11;
                case 11:
                    _g.trys.push([11, 15, , 16]);
                    return [4 /*yield*/, page.context().cookies()];
                case 12:
                    cookies = _g.sent();
                    if (!cookies.find(function (c) { return c.name === 'zpsid'; })) return [3 /*break*/, 14];
                    console.log('\n✅ ĐÃ LOGIN!');
                    console.log('   Phone có hiện "Đồng bộ dữ liệu" checkbox?');
                    (0, node_fs_1.writeFileSync)('/tmp/zalo-playwright-cookies.json', JSON.stringify(cookies, null, 2));
                    return [4 /*yield*/, new Promise(function (r) { return setTimeout(r, 15000); })];
                case 13:
                    _g.sent();
                    return [3 /*break*/, 26];
                case 14: return [3 /*break*/, 16];
                case 15:
                    _b = _g.sent();
                    return [3 /*break*/, 16];
                case 16: return [4 /*yield*/, extractQrData(page)];
                case 17:
                    qr = _g.sent();
                    if (!qr) return [3 /*break*/, 23];
                    newToken = extractToken(qr.data);
                    changed = newToken !== lastToken;
                    if (!!qrFound) return [3 /*break*/, 19];
                    // Lần đầu tìm thấy QR
                    qrFound = true;
                    lastToken = newToken;
                    console.log("[".concat(new Date().toISOString().slice(11, 19), "] QR \u0110\u1EA6U TI\u00CAN | src: ").concat(qr.source));
                    console.log("   token: ".concat(newToken.slice(0, 50), "..."));
                    console.log('');
                    return [4 /*yield*/, renderQr(qr.data)];
                case 18:
                    _g.sent();
                    console.log('');
                    return [3 /*break*/, 22];
                case 19:
                    if (!changed) return [3 /*break*/, 21];
                    stableCount = 0;
                    console.log("\n\uD83D\uDD04 [".concat(new Date().toISOString().slice(11, 19), "] QR THAY \u0110\u1ED4I! | src: ").concat(qr.source));
                    console.log("   token C\u0168: ".concat(lastToken.slice(0, 40), "..."));
                    console.log("   token M\u1EDAI: ".concat(newToken.slice(0, 40), "..."));
                    lastToken = newToken;
                    console.log('');
                    return [4 /*yield*/, renderQr(qr.data)];
                case 20:
                    _g.sent();
                    console.log('');
                    return [3 /*break*/, 22];
                case 21:
                    stableCount++;
                    sec = Math.floor((Date.now() - scanStart) / 1000);
                    process.stdout.write("\r   QR \u1ED5n \u0111\u1ECBnh (".concat(stableCount, "x) | ").concat(sec, "s"));
                    _g.label = 22;
                case 22: return [3 /*break*/, 24];
                case 23:
                    sec = Math.floor((Date.now() - scanStart) / 1000);
                    process.stdout.write("\r   ch\u01B0a th\u1EA5y QR | ".concat(sec, "s"));
                    _g.label = 24;
                case 24: return [4 /*yield*/, new Promise(function (r) { return setTimeout(r, 1500); })];
                case 25:
                    _g.sent();
                    return [3 /*break*/, 10];
                case 26:
                    _c = node_fs_1.writeFileSync;
                    _d = ['/tmp/zalo-playwright-cookies.json'];
                    _f = (_e = JSON).stringify;
                    return [4 /*yield*/, page.context().cookies()];
                case 27:
                    _c.apply(void 0, _d.concat([_f.apply(_e, [_g.sent(), null, 2])]));
                    return [4 /*yield*/, browser.close()];
                case 28:
                    _g.sent();
                    console.log('\n👋 Done!\n');
                    return [2 /*return*/];
            }
        });
    });
}
main().catch(function (err) {
    console.error('\n💥', err.message, '\n');
    process.exit(1);
});
