"use strict";
/**
 * Notion API 服务模块
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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.checkDatabaseProperties = checkDatabaseProperties;
exports.checkBookExistsInNotion = checkBookExistsInNotion;
exports.writeBookToNotion = writeBookToNotion;
exports.writeHighlightsToNotionPage = writeHighlightsToNotionPage;
exports.writeThoughtsToNotionPage = writeThoughtsToNotionPage;
exports.writeReadnotesToDatabase = writeReadnotesToDatabase;
exports.deleteNotionBlocks = deleteNotionBlocks;
const axios_1 = __importDefault(require("axios"));
const constants_1 = require("../../config/constants");
const http_1 = require("../../utils/http");
/**
 * 检查Notion数据库是否包含所有必要的属性字段
 * @param apiKey Notion API密钥
 * @param databaseId 数据库ID
 * @param requiredProperties 必要属性字段列表
 * @returns 缺少的属性字段列表
 */
function checkDatabaseProperties(apiKey, databaseId, requiredProperties) {
    return __awaiter(this, void 0, void 0, function* () {
        console.log(`检查数据库属性: ${databaseId}`);
        try {
            // 设置请求头
            const headers = {
                Authorization: `Bearer ${apiKey}`,
                "Notion-Version": constants_1.NOTION_VERSION,
                "Content-Type": "application/json",
            };
            // 获取数据库信息
            const response = yield axios_1.default.get(`${constants_1.NOTION_API_BASE_URL}/databases/${databaseId}`, { headers });
            // 数据库中存在的属性
            const existingProperties = Object.keys(response.data.properties || {});
            console.log(`数据库包含以下属性: ${existingProperties.join(", ")}`);
            // 检查缺少的属性
            const missingProperties = requiredProperties.filter((prop) => !existingProperties.includes(prop));
            return missingProperties;
        }
        catch (error) {
            console.error(`检查数据库属性失败: ${error.message}`);
            if (error.response) {
                console.error(`状态码: ${error.response.status}`);
                console.error(`响应: ${JSON.stringify(error.response.data)}`);
            }
            // 如果无法检查，返回空数组以避免阻止同步
            return [];
        }
    });
}
function sanitizeRichText(value, maxLength = 1900) {
    if (!value)
        return "";
    const trimmed = value.trim();
    if (trimmed.length <= maxLength)
        return trimmed;
    return trimmed.slice(0, maxLength);
}
function extractPrimaryAuthor(author) {
    if (!author)
        return null;
    const candidates = author
        .split(/[,，/&、；;｜|]/)
        .map((item) => item.trim())
        .filter(Boolean);
    return candidates.length > 0 ? candidates[0] : null;
}
function extractCategoryTags(category) {
    if (!category)
        return [];
    return category
        .split(/[,，;；\\/|、]+/)
        .map((tag) => tag.trim())
        .filter(Boolean);
}
function buildTitleProperty(content) {
    const safeContent = content || "未命名书籍";
    return {
        title: [
            {
                type: "text",
                text: {
                    content: safeContent,
                },
            },
        ],
    };
}
function buildRichTextProperty(content) {
    if (!content) {
        return { rich_text: [] };
    }
    return {
        rich_text: [
            {
                type: "text",
                text: {
                    content,
                },
            },
        ],
    };
}
function buildCoverProperty(title, coverUrl) {
    if (!coverUrl) {
        return {
            files: [],
        };
    }
    return {
        files: [
            {
                type: "external",
                name: `${title || "封面"}-封面`,
                external: {
                    url: coverUrl,
                },
            },
        ],
    };
}
/**
 * 检查书籍是否已存在于Notion数据库中
 */
function checkBookExistsInNotion(apiKey, databaseId, bookTitle, bookAuthor, bookId) {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            console.log(`检查书籍《${bookTitle}》是否已存在于Notion数据库...`);
            // 设置请求头
            const headers = (0, http_1.getNotionHeaders)(apiKey, constants_1.NOTION_VERSION);
            const normalizedAuthor = extractPrimaryAuthor(bookAuthor);
            const titleAuthorFilter = normalizedAuthor && normalizedAuthor.length > 0
                ? {
                    and: [
                        {
                            property: "书名",
                            title: {
                                contains: bookTitle,
                            },
                        },
                        {
                            property: "作者",
                            select: {
                                equals: normalizedAuthor,
                            },
                        },
                    ],
                }
                : {
                    property: "书名",
                    title: {
                        contains: bookTitle,
                    },
                };
            let filter;
            if (bookId) {
                filter = {
                    or: [
                        {
                            property: "书籍ID",
                            rich_text: {
                                equals: bookId,
                            },
                        },
                        titleAuthorFilter,
                    ],
                };
            }
            else {
                filter = titleAuthorFilter;
            }
            const queryData = {
                filter,
            };
            // 发送查询请求
            const response = yield axios_1.default.post(`${constants_1.NOTION_API_BASE_URL}/databases/${databaseId}/query`, queryData, { headers });
            const results = response.data.results;
            if (results && results.length > 0) {
                console.log(`书籍已存在于Notion，页面ID: ${results[0].id}`);
                return { exists: true, pageId: results[0].id };
            }
            console.log("书籍尚未添加到Notion");
            return { exists: false };
        }
        catch (error) {
            const axiosError = error;
            console.error("检查书籍存在性失败:", axiosError.message);
            return { exists: false };
        }
    });
}
/**
 * 将书籍数据写入Notion数据库
 */
function writeBookToNotion(apiKey, databaseId, bookData) {
    return __awaiter(this, void 0, void 0, function* () {
        var _a, _b, _c;
        try {
            console.log(`\n写入书籍《${bookData.title}》到Notion...`);
            // 首先检查是否已存在
            const existCheck = yield checkBookExistsInNotion(apiKey, databaseId, bookData.title, bookData.author || "未知作者", bookData.bookId || bookData.id);
            const existingPageId = existCheck.exists ? existCheck.pageId : undefined;
            // 设置请求头
            const headers = (0, http_1.getNotionHeaders)(apiKey, constants_1.NOTION_VERSION);
            const progressDetails = bookData.progressData || {};
            const rawProgress = (_b = (_a = progressDetails.progress) !== null && _a !== void 0 ? _a : bookData.progress) !== null && _b !== void 0 ? _b : 0;
            const numericProgress = (_c = toNumericValue(rawProgress)) !== null && _c !== void 0 ? _c : 0;
            const progressPercent = clampPercent(numericProgress / 100);
            const startReadingISO = progressDetails.startReadingTime
                ? new Date(progressDetails.startReadingTime * 1000).toISOString()
                : null;
            const lastReadingTimestamp = progressDetails.updateTime ||
                progressDetails.finishTime ||
                null;
            const rawReadingTime = toNumericValue(progressDetails.readingTime);
            const readingTimeSeconds = rawReadingTime && rawReadingTime > 0 ? rawReadingTime : 0;
            const introText = sanitizeRichText(bookData.intro || "", 1900);
            const latestChapter = sanitizeRichText(progressDetails.summary ||
                bookData.latestChapter ||
                bookData.latestChapterTitle ||
                "", 500);
            const bookLink = bookData.bookUrl ||
                bookData.url ||
                bookData.link ||
                (bookData.bookId
                    ? `https://weread.qq.com/web/bookDetail/${bookData.bookId}`
                    : null);
            const authorOption = extractPrimaryAuthor(bookData.author);
            const categoryTags = extractCategoryTags(bookData.category);
            const startReadingSeconds = progressDetails.startReadingTime || null;
            const canonicalLastReadSeconds = lastReadingTimestamp ||
                progressDetails.finishTime ||
                startReadingSeconds ||
                null;
            const hasStarted = Boolean(startReadingSeconds) || readingTimeSeconds > 0;
            const readingDays = hasStarted && startReadingSeconds && canonicalLastReadSeconds
                ? Math.max(1, Math.ceil((canonicalLastReadSeconds - startReadingSeconds) /
                    (24 * 60 * 60)))
                : null;
            const isFinished = Boolean(bookData.finishReading) || progressPercent >= 99.5;
            const nowSeconds = Math.floor(Date.now() / 1000);
            const THIRTY_DAYS = 30 * 24 * 60 * 60;
            const isStalled = hasStarted &&
                !isFinished &&
                canonicalLastReadSeconds !== null &&
                nowSeconds - canonicalLastReadSeconds > THIRTY_DAYS;
            let readingStatusName;
            if (isFinished) {
                readingStatusName = "已读";
            }
            else if (!hasStarted) {
                readingStatusName = "未读";
            }
            else if (isStalled) {
                readingStatusName = "搁置";
            }
            else {
                readingStatusName = "在读";
            }
            const lastReadingISO = hasStarted && canonicalLastReadSeconds
                ? new Date(canonicalLastReadSeconds * 1000).toISOString()
                : null;
            const effectiveReadingTimeSeconds = readingStatusName === "未读" ? 0 : readingTimeSeconds;
            const properties = {
                书名: buildTitleProperty(bookData.title),
                书籍ID: buildRichTextProperty((bookData.bookId || bookData.id || "").toString()),
                ISBN: buildRichTextProperty(bookData.isbn || ""),
                作者: {
                    select: authorOption ? { name: authorOption } : null,
                },
                分类: {
                    multi_select: categoryTags.map((tag) => ({ name: tag })),
                },
                封面: buildCoverProperty(bookData.title, bookData.cover),
                开始阅读时间: {
                    date: startReadingISO ? { start: startReadingISO } : null,
                },
                最后阅读时间: {
                    date: lastReadingISO ? { start: lastReadingISO } : null,
                },
                简介: buildRichTextProperty(introText),
                阅读进度: {
                    number: progressPercent,
                },
                阅读时长: {
                    number: effectiveReadingTimeSeconds,
                },
                阅读天数: {
                    number: readingDays !== null && readingDays !== void 0 ? readingDays : null,
                },
                链接: {
                    url: bookLink || null,
                },
                阅读状态: {
                    status: readingStatusName ? { name: readingStatusName } : null,
                },
                最新阅读章节: buildRichTextProperty(latestChapter),
                出版社: buildRichTextProperty(bookData.publisher || ""),
            };
            // 如果页面已存在，执行更新
            if (existingPageId) {
                console.log(`书籍已存在，更新页面属性: ${existingPageId}`);
                yield axios_1.default.patch(`${constants_1.NOTION_API_BASE_URL}/pages/${existingPageId}`, { properties }, { headers });
                console.log(`书籍《${bookData.title}》的基础信息已刷新`);
                return { success: true, pageId: existingPageId };
            }
            // 发送请求创建页面
            const createPayload = {
                parent: {
                    database_id: databaseId,
                },
                icon: {
                    type: "emoji",
                    emoji: "📘",
                },
                properties,
            };
            const response = yield axios_1.default.post(`${constants_1.NOTION_API_BASE_URL}/pages`, createPayload, {
                headers,
            });
            console.log(`请求成功，响应状态码: ${response.status}`);
            console.log(`新创建页面ID: ${response.data.id}`);
            return { success: true, pageId: response.data.id };
        }
        catch (error) {
            const axiosError = error;
            console.error("写入数据失败:", axiosError.message);
            if (axiosError.response) {
                console.error("响应状态:", axiosError.response.status);
                console.error("响应数据:", JSON.stringify(axiosError.response.data, null, 2));
            }
            return { success: false };
        }
    });
}
/**
 * 将划线数据写入到Notion页面
 */
function writeHighlightsToNotionPage(apiKey_1, pageId_1, bookInfo_1, highlights_1) {
    return __awaiter(this, arguments, void 0, function* (apiKey, pageId, bookInfo, highlights, organizeByChapter = false) {
        try {
            console.log(`\n写入划线数据到Notion页面 ${pageId}...`);
            console.log(`划线数据数组长度: ${highlights.length}`);
            console.log(`按章节组织: ${organizeByChapter ? "是" : "否"}`);
            // 先删除页面中已有的划线区块
            const deleteResult = yield deleteNotionBlocks(apiKey, pageId, "highlights");
            if (!deleteResult) {
                console.warn("删除旧划线区块失败，可能会导致内容重复");
            }
            // 设置请求头
            const headers = (0, http_1.getNotionHeaders)(apiKey, constants_1.NOTION_VERSION);
            // 创建页面内容的blocks - 只添加划线区域标题
            const blocks = [
                // 添加"划线"标题
                {
                    object: "block",
                    type: "heading_1",
                    heading_1: {
                        rich_text: [
                            {
                                type: "text",
                                text: {
                                    content: "📌 划线",
                                },
                            },
                        ],
                    },
                },
                // 添加分隔符
                {
                    object: "block",
                    type: "divider",
                    divider: {},
                },
            ];
            // 如果没有划线，添加提示
            if (highlights.length === 0) {
                console.log(`无划线数据，添加提示信息`);
                blocks.push({
                    object: "block",
                    type: "paragraph",
                    paragraph: {
                        rich_text: [
                            {
                                type: "text",
                                text: {
                                    content: "该书暂无划线内容",
                                },
                                annotations: {
                                    italic: true,
                                },
                            },
                        ],
                    },
                });
            }
            else {
                console.log(`开始处理 ${highlights.length} 个章节的划线`);
                // 将章节按照 chapterUid 正序排列
                const sortedHighlights = [...highlights].sort((a, b) => a.chapterUid - b.chapterUid);
                console.log(`已将章节按顺序排列，从小到大`);
                // 按章节添加划线
                for (const chapter of sortedHighlights) {
                    console.log(`处理章节 "${chapter.chapterTitle}"，包含 ${chapter.highlights.length} 条划线`);
                    // 如果按章节组织，添加章节标题
                    if (organizeByChapter) {
                        blocks.push({
                            object: "block",
                            type: "heading_2",
                            heading_2: {
                                rich_text: [
                                    {
                                        type: "text",
                                        text: {
                                            content: chapter.chapterTitle || `章节 ${chapter.chapterUid}`,
                                        },
                                    },
                                ],
                            },
                        });
                    }
                    // 添加每条划线
                    for (const highlight of chapter.highlights) {
                        // 添加划线内容
                        blocks.push({
                            object: "block",
                            type: "quote",
                            quote: {
                                rich_text: [
                                    {
                                        type: "text",
                                        text: {
                                            content: highlight.text,
                                        },
                                    },
                                ],
                            },
                        });
                        // 如果不按章节组织，添加分隔符
                        if (!organizeByChapter) {
                            blocks.push({
                                object: "block",
                                type: "divider",
                                divider: {},
                            });
                        }
                    }
                    // 如果按章节组织，在章节结束后添加分隔符
                    if (organizeByChapter) {
                        blocks.push({
                            object: "block",
                            type: "divider",
                            divider: {},
                        });
                    }
                }
            }
            return yield addBlocksToNotion(apiKey, pageId, blocks);
        }
        catch (error) {
            const axiosError = error;
            console.error("写入划线数据失败:", axiosError.message);
            return false;
        }
    });
}
/**
 * 将想法数据写入到Notion页面
 */
function writeThoughtsToNotionPage(apiKey_1, pageId_1, bookInfo_1, thoughts_1) {
    return __awaiter(this, arguments, void 0, function* (apiKey, pageId, bookInfo, thoughts, incrementalUpdate = false, organizeByChapter = false) {
        try {
            console.log(`\n写入想法数据到Notion页面 ${pageId}...`);
            console.log(`想法数据数组长度: ${thoughts.length}`);
            console.log(`按章节组织: ${organizeByChapter ? "是" : "否"}`);
            // 只有在非增量更新或有新想法时才删除旧内容
            const shouldDeleteOldThoughts = !incrementalUpdate || thoughts.length > 0;
            if (shouldDeleteOldThoughts) {
                // 先删除页面中已有的想法区块
                const deleteResult = yield deleteNotionBlocks(apiKey, pageId, "thoughts");
                if (!deleteResult) {
                    console.warn("删除旧想法区块失败，可能会导致内容重复");
                }
            }
            else {
                console.log("增量更新模式且没有新想法，保留现有想法区块");
            }
            // 如果在增量模式下没有新想法，则跳过写入步骤
            if (incrementalUpdate && thoughts.length === 0) {
                console.log("增量更新模式下没有新想法，跳过写入步骤");
                return true;
            }
            // 设置请求头
            const headers = (0, http_1.getNotionHeaders)(apiKey, constants_1.NOTION_VERSION);
            // 创建页面内容的blocks - 只添加想法区域标题
            const blocks = [
                // 添加"想法"标题
                {
                    object: "block",
                    type: "heading_1",
                    heading_1: {
                        rich_text: [
                            {
                                type: "text",
                                text: {
                                    content: "💭 想法",
                                },
                            },
                        ],
                    },
                },
                // 添加分隔符
                {
                    object: "block",
                    type: "divider",
                    divider: {},
                },
            ];
            // 按章节对想法进行分组
            const thoughtsByChapter = thoughts.reduce((acc, thought) => {
                const chapterUid = thought.chapterUid || 0;
                if (!acc[chapterUid]) {
                    acc[chapterUid] = {
                        chapterTitle: thought.chapterTitle || `章节 ${chapterUid}`,
                        thoughts: [],
                    };
                }
                acc[chapterUid].thoughts.push(thought);
                return acc;
            }, {});
            // 将章节按UID排序
            const sortedChapterUids = Object.keys(thoughtsByChapter).sort((a, b) => parseInt(a) - parseInt(b));
            console.log(`想法已按 ${sortedChapterUids.length} 个章节分组`);
            // 遍历每个章节
            for (const chapterUid of sortedChapterUids) {
                const chapterData = thoughtsByChapter[chapterUid];
                const chapterThoughts = chapterData.thoughts;
                console.log(`处理章节 ${chapterUid} 中的 ${chapterThoughts.length} 条想法`);
                // 如果按章节组织，添加章节标题
                if (organizeByChapter) {
                    blocks.push({
                        object: "block",
                        type: "heading_2",
                        heading_2: {
                            rich_text: [
                                {
                                    type: "text",
                                    text: {
                                        content: chapterData.chapterTitle,
                                    },
                                },
                            ],
                        },
                    });
                }
                // 添加每条想法
                for (const thought of chapterThoughts) {
                    // 添加原文（使用引用块）
                    if (thought.abstract) {
                        blocks.push({
                            object: "block",
                            type: "quote",
                            quote: {
                                rich_text: [
                                    {
                                        type: "text",
                                        text: {
                                            content: thought.abstract,
                                        },
                                    },
                                ],
                            },
                        });
                    }
                    // 添加想法内容（使用段落块，加粗显示）
                    if (thought.content) {
                        blocks.push({
                            object: "block",
                            type: "paragraph",
                            paragraph: {
                                rich_text: [
                                    {
                                        type: "text",
                                        text: {
                                            content: `💭 ${thought.content}`,
                                        },
                                        annotations: {
                                            bold: true,
                                            color: "blue",
                                        },
                                    },
                                ],
                            },
                        });
                    }
                    // 如果不按章节组织，添加分隔符
                    if (!organizeByChapter) {
                        blocks.push({
                            object: "block",
                            type: "divider",
                            divider: {},
                        });
                    }
                }
                // 如果按章节组织，在章节结束后添加分隔符
                if (organizeByChapter) {
                    blocks.push({
                        object: "block",
                        type: "divider",
                        divider: {},
                    });
                }
            }
            return yield addBlocksToNotion(apiKey, pageId, blocks);
        }
        catch (error) {
            const axiosError = error;
            console.error("写入想法数据失败:", axiosError.message);
            return false;
        }
    });
}
/**
 * 写入读书笔记到独立数据库
 */
function writeReadnotesToDatabase(apiKey, databaseId, entries, bookTitle) {
    return __awaiter(this, void 0, void 0, function* () {
        if (!databaseId) {
            console.error("未配置 READNOTE_DATABASE_ID，无法写入读书笔记");
            return false;
        }
        if (!entries || entries.length === 0) {
            console.log("没有新的读书笔记需要写入");
            return true;
        }
        try {
            const uniqueEntries = Array.from(entries.reduce((map, entry) => {
                if (!map.has(entry.weid)) {
                    map.set(entry.weid, entry);
                }
                return map;
            }, new Map()).values());
            const existingWeids = yield fetchExistingReadnoteWeids(apiKey, databaseId, uniqueEntries.map((entry) => entry.weid));
            const pendingEntries = uniqueEntries.filter((entry) => !existingWeids.has(entry.weid));
            if (pendingEntries.length === 0) {
                console.log(`${bookTitle ? `《${bookTitle}》` : "当前书籍"}的读书笔记无需写入（已存在）`);
                return true;
            }
            const headers = (0, http_1.getNotionHeaders)(apiKey, constants_1.NOTION_VERSION);
            let success = true;
            let writtenCount = 0;
            for (const chunk of chunkArray(pendingEntries, 10)) {
                for (const entry of chunk) {
                    try {
                        const payload = {
                            parent: {
                                database_id: databaseId,
                            },
                            icon: {
                                type: "emoji",
                                emoji: "✏️",
                            },
                            properties: buildReadnoteProperties(entry),
                        };
                        yield axios_1.default.post(`${constants_1.NOTION_API_BASE_URL}/pages`, payload, {
                            headers,
                        });
                        writtenCount += 1;
                    }
                    catch (error) {
                        success = false;
                        const axiosError = error;
                        console.error(`写入读书笔记失败（WEID: ${entry.weid}）:`, axiosError.message);
                        if (axiosError.response) {
                            console.error("响应数据:", JSON.stringify(axiosError.response.data, null, 2));
                        }
                    }
                }
            }
            if (success) {
                console.log(`${bookTitle ? `《${bookTitle}》` : "当前书籍"}的读书笔记已写入 ${writtenCount} 条`);
            }
            return success;
        }
        catch (error) {
            console.error("写入读书笔记数据库失败:", error.message);
            return false;
        }
    });
}
/**
 * 批量添加Blocks到Notion
 */
function addBlocksToNotion(apiKey, pageId, blocks) {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            console.log(`共准备了 ${blocks.length} 个 blocks 用于添加到 Notion 页面`);
            // 设置请求头
            const headers = (0, http_1.getNotionHeaders)(apiKey, constants_1.NOTION_VERSION);
            // 一次请求最多只能添加100个block，所以可能需要分批添加
            const MAX_BLOCKS_PER_REQUEST = 100;
            for (let i = 0; i < blocks.length; i += MAX_BLOCKS_PER_REQUEST) {
                const batchBlocks = blocks.slice(i, i + MAX_BLOCKS_PER_REQUEST);
                console.log(`添加第 ${i + 1} 到 ${i + batchBlocks.length} 个block...`);
                try {
                    // 调用Notion API添加blocks
                    const response = yield axios_1.default.patch(`${constants_1.NOTION_API_BASE_URL}/blocks/${pageId}/children`, {
                        children: batchBlocks,
                    }, { headers });
                    console.log(`API响应状态: ${response.status}`);
                }
                catch (error) {
                    console.error(`添加blocks批次失败:`, error.message);
                    if (error.response) {
                        console.error(`响应状态: ${error.response.status}`);
                        console.error(`响应数据: ${JSON.stringify(error.response.data).substring(0, 300)}...`);
                    }
                    throw error; // 重新抛出错误以便外层捕获
                }
                // 如果还有更多blocks要添加，等待一下避免请求过快
                if (i + MAX_BLOCKS_PER_REQUEST < blocks.length) {
                    console.log(`等待500毫秒后继续添加下一批次...`);
                    yield new Promise((resolve) => setTimeout(resolve, 500));
                }
            }
            console.log(`数据已成功写入到Notion页面`);
            return true;
        }
        catch (error) {
            const axiosError = error;
            console.error("写入数据失败:", axiosError.message);
            return false;
        }
    });
}
/**
 * 删除Notion页面中特定类型的内容块
 */
function deleteNotionBlocks(apiKey, pageId, blockType) {
    return __awaiter(this, void 0, void 0, function* () {
        var _a, _b, _c, _d, _e, _f, _g, _h;
        try {
            console.log(`查找并删除页面 ${pageId} 中的${blockType === "highlights" ? "划线" : "想法"}区块...`);
            // 设置请求头
            const headers = (0, http_1.getNotionHeaders)(apiKey, constants_1.NOTION_VERSION);
            // 查找页面中的所有区块
            const response = yield axios_1.default.get(`${constants_1.NOTION_API_BASE_URL}/blocks/${pageId}/children?page_size=100`, { headers });
            const blocks = response.data.results;
            console.log(`获取到 ${blocks.length} 个顶级区块`);
            // 查找特定标题的区块和其后的内容
            let foundHeader = false;
            let blocksToDelete = [];
            const headerText = blockType === "highlights" ? "📌 划线" : "💭 想法";
            for (const block of blocks) {
                // 检查是否是我们要找的标题
                if (block.type === "heading_1" &&
                    ((_d = (_c = (_b = (_a = block.heading_1) === null || _a === void 0 ? void 0 : _a.rich_text) === null || _b === void 0 ? void 0 : _b[0]) === null || _c === void 0 ? void 0 : _c.text) === null || _d === void 0 ? void 0 : _d.content) === headerText) {
                    foundHeader = true;
                    blocksToDelete.push(block.id);
                    console.log(`找到${blockType === "highlights" ? "划线" : "想法"}标题区块: ${block.id}`);
                    continue;
                }
                // 如果已找到标题，收集后续区块直到找到另一个标题
                if (foundHeader) {
                    if (block.type === "heading_1") {
                        const text = ((_h = (_g = (_f = (_e = block.heading_1) === null || _e === void 0 ? void 0 : _e.rich_text) === null || _f === void 0 ? void 0 : _f[0]) === null || _g === void 0 ? void 0 : _g.text) === null || _h === void 0 ? void 0 : _h.content) || "";
                        // 如果遇到另一个标题，停止收集
                        if (text === "📌 划线" || text === "💭 想法") {
                            console.log(`遇到新标题 "${text}", 停止收集区块`);
                            foundHeader = false;
                            continue;
                        }
                    }
                    // 收集这个区块
                    blocksToDelete.push(block.id);
                }
            }
            // 删除收集到的区块
            if (blocksToDelete.length > 0) {
                console.log(`将删除 ${blocksToDelete.length} 个与${blockType === "highlights" ? "划线" : "想法"}相关的区块`);
                // 删除所有收集到的区块
                // Notion API要求一次只能删除一个区块，所以需要循环调用
                for (const blockId of blocksToDelete) {
                    try {
                        yield axios_1.default.delete(`${constants_1.NOTION_API_BASE_URL}/blocks/${blockId}`, {
                            headers,
                        });
                        // 为避免API限流，加一点延迟
                        yield new Promise((resolve) => setTimeout(resolve, 100));
                    }
                    catch (error) {
                        console.error(`删除区块 ${blockId} 失败:`, error.message);
                        // 继续删除其它区块
                    }
                }
                console.log(`成功删除旧的${blockType === "highlights" ? "划线" : "想法"}区块`);
            }
            else {
                console.log(`未找到需要删除的${blockType === "highlights" ? "划线" : "想法"}区块`);
            }
            return true;
        }
        catch (error) {
            const axiosError = error;
            console.error(`删除Notion区块失败:`, axiosError.message);
            return false;
        }
    });
}
function fetchExistingReadnoteWeids(apiKey, databaseId, weids) {
    return __awaiter(this, void 0, void 0, function* () {
        var _a;
        const cleanWeids = weids.filter((id) => !!id);
        const existing = new Set();
        if (cleanWeids.length === 0) {
            return existing;
        }
        const headers = (0, http_1.getNotionHeaders)(apiKey, constants_1.NOTION_VERSION);
        const chunkSize = 20;
        for (const chunk of chunkArray(cleanWeids, chunkSize)) {
            try {
                const filter = {
                    or: chunk.map((weid) => ({
                        property: "WEID",
                        rich_text: {
                            equals: weid,
                        },
                    })),
                };
                const response = yield axios_1.default.post(`${constants_1.NOTION_API_BASE_URL}/databases/${databaseId}/query`, { filter }, { headers });
                const results = ((_a = response.data) === null || _a === void 0 ? void 0 : _a.results) || [];
                results.forEach((page) => {
                    var _a, _b;
                    const richTexts = (_b = (_a = page === null || page === void 0 ? void 0 : page.properties) === null || _a === void 0 ? void 0 : _a.WEID) === null || _b === void 0 ? void 0 : _b.rich_text;
                    if (Array.isArray(richTexts) && richTexts.length > 0) {
                        const value = richTexts.map((item) => item.plain_text).join("");
                        if (value) {
                            existing.add(value);
                        }
                    }
                });
            }
            catch (error) {
                const axiosError = error;
                console.error("查询已存在读书笔记失败:", axiosError.message);
            }
        }
        return existing;
    });
}
function buildReadnoteProperties(entry) {
    const safeContent = (entry.content || "（未提供内容）").trim();
    return {
        内容: {
            title: [
                {
                    type: "text",
                    text: {
                        content: safeContent,
                    },
                },
            ],
        },
        笔记: {
            rich_text: entry.note
                ? [
                    {
                        type: "text",
                        text: {
                            content: entry.note,
                        },
                    },
                ]
                : [],
        },
        类型: {
            select: {
                name: entry.type,
            },
        },
        章节标题: {
            rich_text: entry.chapterTitle
                ? [
                    {
                        type: "text",
                        text: {
                            content: entry.chapterTitle,
                        },
                    },
                ]
                : [],
        },
        创建时间: {
            date: entry.createdAt
                ? {
                    start: new Date(entry.createdAt).toISOString(),
                }
                : null,
        },
        书籍: {
            relation: entry.bookPageId
                ? [
                    {
                        id: entry.bookPageId,
                    },
                ]
                : [],
        },
        WEID: {
            rich_text: [
                {
                    type: "text",
                    text: {
                        content: entry.weid,
                    },
                },
            ],
        },
    };
}
function chunkArray(items, size) {
    const chunks = [];
    for (let i = 0; i < items.length; i += size) {
        chunks.push(items.slice(i, i + size));
    }
    return chunks;
}
function clampPercent(value) {
    if (typeof value !== "number" || !isFinite(value)) {
        return 0;
    }
    return Math.min(100, Math.max(0, Number(value.toFixed(2))));
}
function toNumericValue(value) {
    if (value === undefined || value === null) {
        return null;
    }
    if (typeof value === "number") {
        return Number.isNaN(value) ? null : value;
    }
    if (typeof value === "string") {
        const trimmed = value.trim();
        if (!trimmed)
            return null;
        const numeric = parseFloat(trimmed.replace(/[^\d.-]/g, ""));
        return Number.isNaN(numeric) ? null : numeric;
    }
    return null;
}
