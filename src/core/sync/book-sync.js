"use strict";
/**
 * 书籍同步核心模块
 */
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.syncBookContent = syncBookContent;
exports.syncSingleBook = syncSingleBook;
const file_1 = require("../../utils/file");
const formatter_1 = require("../formatter");
const crypto_1 = require("crypto");
const services_1 = require("../../api/notion/services");
const services_2 = require("../../api/weread/services");
/**
 * 同步书籍内容（划线和想法）到Notion
 * 确保先写入划线，再写入想法
 */
function syncBookContent(apiKey_1, databaseId_1, cookie_1, bookId_1, finalPageId_1, bookInfo_1) {
    return __awaiter(this, arguments, void 0, function* (apiKey, databaseId, cookie, bookId, finalPageId, bookInfo, useIncremental = true, organizeByChapter = false, readnoteDatabaseId) {
        console.log(`\n=== 同步书籍内容 ===`);
        console.log(`按章节组织: ${organizeByChapter ? "是" : "否"}`);
        try {
            // 获取书籍划线数据 - 使用增量同步
            const { highlights, synckey: highlightsSynckey, hasUpdate: hasHighlightUpdate, } = yield (0, formatter_1.getBookHighlightsFormatted)(cookie, bookId, useIncremental);
            // 获取书籍想法数据 - 同样使用增量同步获取新想法
            const { thoughts, synckey: thoughtsSynckey, hasUpdate: hasThoughtUpdate, } = yield (0, formatter_1.getBookThoughtsFormatted)(cookie, bookId, useIncremental);
            // 判断是否有更新
            const hasUpdates = hasHighlightUpdate || hasThoughtUpdate || !useIncremental;
            if (!hasUpdates) {
                console.log(`《${bookInfo.title}》没有检测到新内容，跳过内容同步`);
                return {
                    success: true,
                    highlightsSynckey,
                    thoughtsSynckey,
                    hasUpdate: false,
                    highlights: [],
                    thoughts: [],
                };
            }
            if (!readnoteDatabaseId) {
                throw new Error("缺少 READNOTE_DATABASE_ID，无法写入读书笔记数据库");
            }
            const readnoteEntries = buildReadnoteEntries(bookInfo, finalPageId, highlights, thoughts);
            if (readnoteEntries.length === 0) {
                console.log("没有需要写入的读书笔记内容");
            }
            else {
                const thoughtCount = readnoteEntries.filter((entry) => entry.type === READNOTE_TYPE_THOUGHT).length;
                const summaryCount = readnoteEntries.length - thoughtCount;
                console.log(`准备写入 ${readnoteEntries.length} 条读书笔记（想法 ${thoughtCount} 条，摘要 ${summaryCount} 条）`);
            }
            const readnoteResult = readnoteEntries.length === 0
                ? true
                : yield (0, services_1.writeReadnotesToDatabase)(apiKey, readnoteDatabaseId, readnoteEntries, bookInfo.title);
            if (readnoteResult) {
                console.log(`《${bookInfo.title}》的读书笔记同步完成（共 ${readnoteEntries.length} 条）`);
            }
            else {
                console.warn(`《${bookInfo.title}》的读书笔记同步失败`);
            }
            // 返回同步结果和synckey
            return {
                success: readnoteResult,
                highlightsSynckey,
                thoughtsSynckey,
                hasUpdate: true,
                highlights,
                thoughts,
            };
        }
        catch (error) {
            console.error(`同步书籍内容失败:`, error.message);
            return {
                success: false,
                highlightsSynckey: "",
                thoughtsSynckey: "",
                hasUpdate: false,
                highlights: [],
                thoughts: [],
            };
        }
    });
}
/**
 * 同步单本书
 */
function syncSingleBook(apiKey_1, databaseId_1, cookie_1, bookId_1) {
    return __awaiter(this, arguments, void 0, function* (apiKey, databaseId, cookie, bookId, useIncremental = true, organizeByChapter = false, readnoteDatabaseId) {
        console.log(`\n=== 开始${useIncremental ? "增量" : "全量"}同步书籍(ID: ${bookId}) ===`);
        try {
            // 获取书籍详细信息
            const bookInfo = yield (0, services_2.getBookInfo)(cookie, bookId);
            if (!bookInfo) {
                console.error(`未能获取到书籍 ${bookId} 的信息`);
                return false;
            }
            // 添加读书状态
            bookInfo.finishReadingStatus = bookInfo.finishReading ? "已读完" : "未读完";
            // 检查书籍是否已存在
            const { exists, pageId: existingPageId } = yield (0, services_1.checkBookExistsInNotion)(apiKey, databaseId, bookInfo.title, bookInfo.author, bookInfo.bookId);
            let finalPageId;
            if (exists && existingPageId) {
                console.log(`书籍《${bookInfo.title}》已存在，将更新现有记录`);
                finalPageId = existingPageId;
            }
            else {
                // 写入书籍元数据到Notion
                const writeResult = yield (0, services_1.writeBookToNotion)(apiKey, databaseId, bookInfo);
                if (!writeResult.success || !writeResult.pageId) {
                    console.error(`写入书籍 ${bookId} 到Notion失败`);
                    return false;
                }
                finalPageId = writeResult.pageId;
            }
            // 同步书籍内容
            const syncContentResult = yield syncBookContent(apiKey, databaseId, cookie, bookId, finalPageId, bookInfo, useIncremental, organizeByChapter, readnoteDatabaseId);
            // 保存同步状态
            if (useIncremental) {
                const syncState = {
                    bookId,
                    lastSyncTime: Date.now(),
                    highlightsSynckey: syncContentResult.highlightsSynckey,
                    thoughtsSynckey: syncContentResult.thoughtsSynckey,
                };
                (0, file_1.saveSyncState)(syncState);
                console.log(`已保存同步状态，highlightsSynckey: ${syncContentResult.highlightsSynckey}, thoughtsSynckey: ${syncContentResult.thoughtsSynckey}`);
            }
            console.log(`书籍 ${bookId} 同步完成`);
            return true;
        }
        catch (error) {
            console.error(`同步书籍 ${bookId} 失败:`, error.message);
            return false;
        }
    });
}
const READNOTE_TYPE_THOUGHT = "想法";
const READNOTE_TYPE_SUMMARY = "摘要";
function buildReadnoteEntries(bookInfo, bookPageId, highlightChapters, thoughts) {
    const entries = [];
    const bookId = ((bookInfo === null || bookInfo === void 0 ? void 0 : bookInfo.bookId) || (bookInfo === null || bookInfo === void 0 ? void 0 : bookInfo.id) || "").toString();
    const abstractKeySet = new Set();
    const seenWeids = new Set();
    const safeThoughts = Array.isArray(thoughts) ? thoughts : [];
    safeThoughts.forEach((thought) => {
        const abstractText = (thought.abstract || "").trim();
        const noteText = (thought.content || "").trim();
        const contentText = abstractText || noteText;
        if (!contentText) {
            return;
        }
        const weid = (thought.reviewId && thought.reviewId.toString()) ||
            generateFallbackWeid(bookId, "thought", contentText, thought.createTime);
        if (seenWeids.has(weid)) {
            return;
        }
        seenWeids.add(weid);
        if (abstractText) {
            abstractKeySet.add(generateContentKey(bookId, abstractText));
        }
        entries.push({
            weid,
            type: READNOTE_TYPE_THOUGHT,
            content: contentText,
            note: noteText || undefined,
            chapterTitle: thought.chapterTitle || "未命名章节",
            createdAt: ensureMilliseconds(thought.createTime),
            bookPageId,
        });
    });
    const flattenedHighlights = flattenHighlights(highlightChapters);
    flattenedHighlights.forEach((highlight) => {
        const text = (highlight.text || "").trim();
        if (!text) {
            return;
        }
        const contentKey = generateContentKey(bookId, text);
        if (abstractKeySet.has(contentKey)) {
            return;
        }
        const weid = (highlight.bookmarkId && highlight.bookmarkId.toString()) ||
            generateFallbackWeid(bookId, "highlight", text, highlight.created);
        if (seenWeids.has(weid)) {
            return;
        }
        seenWeids.add(weid);
        entries.push({
            weid,
            type: READNOTE_TYPE_SUMMARY,
            content: text,
            chapterTitle: highlight.chapterTitle || "未命名章节",
            createdAt: ensureMilliseconds(highlight.created),
            bookPageId,
        });
    });
    return entries;
}
function flattenHighlights(chapters) {
    if (!Array.isArray(chapters)) {
        return [];
    }
    return chapters.reduce((acc, chapter) => {
        var _a;
        if ((_a = chapter === null || chapter === void 0 ? void 0 : chapter.highlights) === null || _a === void 0 ? void 0 : _a.length) {
            acc.push(...chapter.highlights);
        }
        return acc;
    }, []);
}
function generateContentKey(bookId, text) {
    if (!text) {
        return `${bookId || "unknown"}::empty`;
    }
    return `${bookId || "unknown"}::${normalizeText(text)}`;
}
function normalizeText(text) {
    return text.replace(/\s+/g, "").toLowerCase();
}
function ensureMilliseconds(timestamp) {
    if (timestamp === undefined || timestamp === null) {
        return undefined;
    }
    const numericValue = typeof timestamp === "number" ? timestamp : parseInt(timestamp, 10);
    if (Number.isNaN(numericValue)) {
        return undefined;
    }
    return numericValue > 9999999999 ? numericValue : numericValue * 1000;
}
function generateFallbackWeid(bookId, type, text, timestamp) {
    const hash = (0, crypto_1.createHash)("md5")
        .update(`${bookId || "unknown"}-${type}-${text}-${timestamp || ""}`)
        .digest("hex");
    return `${type}-${hash}`;
}
