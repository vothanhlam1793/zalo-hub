import { PassThrough } from "node:stream";
import { createReadableStreamFromReadable } from "@react-router/node";
import { Links, Meta, Outlet, Scripts, ScrollRestoration, ServerRouter, UNSAFE_withComponentProps, redirect, useLoaderData } from "react-router";
import { isbot } from "isbot";
import { renderToPipeableStream } from "react-dom/server";
import { Fragment, jsx, jsxs } from "react/jsx-runtime";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Avatar, Dialog, Label, Select, Separator, Slot, Switch, Tabs, Tooltip } from "radix-ui";
import { clsx } from "clsx";
import { twMerge } from "tailwind-merge";
import { cva } from "class-variance-authority";
import { CheckIcon, ChevronDownIcon, ChevronLeftIcon, ChevronRightIcon, ChevronUpIcon, DownloadIcon, XIcon, ZoomInIcon, ZoomOutIcon } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { create } from "zustand";
//#region \0rolldown/runtime.js
var __defProp = Object.defineProperty;
var __exportAll = (all, no_symbols) => {
	let target = {};
	for (var name in all) __defProp(target, name, {
		get: all[name],
		enumerable: true
	});
	if (!no_symbols) __defProp(target, Symbol.toStringTag, { value: "Module" });
	return target;
};
//#endregion
//#region node_modules/@react-router/dev/dist/config/defaults/entry.server.node.tsx
var entry_server_node_exports = /* @__PURE__ */ __exportAll({
	default: () => handleRequest,
	streamTimeout: () => streamTimeout
});
var streamTimeout = 5e3;
function handleRequest(request, responseStatusCode, responseHeaders, routerContext, loadContext) {
	if (request.method.toUpperCase() === "HEAD") return new Response(null, {
		status: responseStatusCode,
		headers: responseHeaders
	});
	return new Promise((resolve, reject) => {
		let shellRendered = false;
		let userAgent = request.headers.get("user-agent");
		let readyOption = userAgent && isbot(userAgent) || routerContext.isSpaMode ? "onAllReady" : "onShellReady";
		let timeoutId = setTimeout(() => abort(), streamTimeout + 1e3);
		const { pipe, abort } = renderToPipeableStream(/* @__PURE__ */ jsx(ServerRouter, {
			context: routerContext,
			url: request.url
		}), {
			[readyOption]() {
				shellRendered = true;
				const body = new PassThrough({ final(callback) {
					clearTimeout(timeoutId);
					timeoutId = void 0;
					callback();
				} });
				const stream = createReadableStreamFromReadable(body);
				responseHeaders.set("Content-Type", "text/html");
				pipe(body);
				resolve(new Response(stream, {
					headers: responseHeaders,
					status: responseStatusCode
				}));
			},
			onShellError(error) {
				reject(error);
			},
			onError(error) {
				responseStatusCode = 500;
				if (shellRendered) console.error(error);
			}
		});
	});
}
//#endregion
//#region src/app.css?url
var app_default = "/assets/app-mBUex1b3.css";
//#endregion
//#region app/root.tsx
var root_exports = /* @__PURE__ */ __exportAll({
	Layout: () => Layout,
	default: () => root_default,
	links: () => links
});
function links() {
	return [{
		rel: "stylesheet",
		href: app_default,
		crossOrigin: ""
	}];
}
function Layout({ children }) {
	return /* @__PURE__ */ jsxs("html", {
		lang: "vi",
		children: [/* @__PURE__ */ jsxs("head", { children: [
			/* @__PURE__ */ jsx("meta", { charSet: "utf-8" }),
			/* @__PURE__ */ jsx("meta", {
				name: "viewport",
				content: "width=device-width, initial-scale=1.0"
			}),
			/* @__PURE__ */ jsx("title", { children: "Zalo Hub" }),
			/* @__PURE__ */ jsx(Meta, {}),
			/* @__PURE__ */ jsx(Links, {})
		] }), /* @__PURE__ */ jsxs("body", { children: [
			children,
			/* @__PURE__ */ jsx(ScrollRestoration, {}),
			/* @__PURE__ */ jsx(Scripts, {})
		] })]
	});
}
var root_default = UNSAFE_withComponentProps(function Root() {
	return /* @__PURE__ */ jsx(Outlet, {});
});
//#endregion
//#region app/lib/server-fetch.ts
var BFF_URL = process.env.BFF_URL || "http://127.0.0.1:3401";
function serverFetch(path, cookie, init) {
	const headers = {};
	if (cookie) headers.cookie = cookie;
	if (init?.body && !(init.body instanceof FormData)) headers["content-type"] = "application/json";
	return fetch(`${BFF_URL}${path}`, {
		...init,
		headers: {
			...headers,
			...init?.headers || {}
		},
		credentials: "include"
	});
}
//#endregion
//#region src/lib/utils.ts
function cn(...inputs) {
	return twMerge(clsx(inputs));
}
//#endregion
//#region src/components/ui/tooltip.tsx
function TooltipProvider({ delayDuration = 0, ...props }) {
	return /* @__PURE__ */ jsx(Tooltip.Provider, {
		"data-slot": "tooltip-provider",
		delayDuration,
		...props
	});
}
function Tooltip$1({ ...props }) {
	return /* @__PURE__ */ jsx(Tooltip.Root, {
		"data-slot": "tooltip",
		...props
	});
}
function TooltipTrigger({ ...props }) {
	return /* @__PURE__ */ jsx(Tooltip.Trigger, {
		"data-slot": "tooltip-trigger",
		...props
	});
}
function TooltipContent({ className, sideOffset = 0, children, ...props }) {
	return /* @__PURE__ */ jsx(Tooltip.Portal, { children: /* @__PURE__ */ jsxs(Tooltip.Content, {
		"data-slot": "tooltip-content",
		sideOffset,
		className: cn("z-50 w-fit origin-(--radix-tooltip-content-transform-origin) animate-in rounded-md bg-foreground px-3 py-1.5 text-xs text-balance text-background fade-in-0 zoom-in-95 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95", className),
		...props,
		children: [children, /* @__PURE__ */ jsx(Tooltip.Arrow, { className: "z-50 size-2.5 translate-y-[calc(-50%_-_2px)] rotate-45 rounded-[2px] bg-foreground fill-foreground" })]
	}) });
}
//#endregion
//#region src/components/ui/button.tsx
var buttonVariants = cva("inline-flex shrink-0 items-center justify-center gap-2 rounded-md text-sm font-medium whitespace-nowrap transition-all outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4", {
	variants: {
		variant: {
			default: "bg-primary text-primary-foreground hover:bg-primary/90",
			destructive: "bg-destructive text-white hover:bg-destructive/90 focus-visible:ring-destructive/20 dark:bg-destructive/60 dark:focus-visible:ring-destructive/40",
			outline: "border bg-background shadow-xs hover:bg-accent hover:text-accent-foreground dark:border-input dark:bg-input/30 dark:hover:bg-input/50",
			secondary: "bg-secondary text-secondary-foreground hover:bg-secondary/80",
			ghost: "hover:bg-accent hover:text-accent-foreground dark:hover:bg-accent/50",
			link: "text-primary underline-offset-4 hover:underline"
		},
		size: {
			default: "h-9 px-4 py-2 has-[>svg]:px-3",
			xs: "h-6 gap-1 rounded-md px-2 text-xs has-[>svg]:px-1.5 [&_svg:not([class*='size-'])]:size-3",
			sm: "h-8 gap-1.5 rounded-md px-3 has-[>svg]:px-2.5",
			lg: "h-10 rounded-md px-6 has-[>svg]:px-4",
			icon: "size-9",
			"icon-xs": "size-6 rounded-md [&_svg:not([class*='size-'])]:size-3",
			"icon-sm": "size-8",
			"icon-lg": "size-10"
		}
	},
	defaultVariants: {
		variant: "default",
		size: "default"
	}
});
function Button({ className, variant = "default", size = "default", asChild = false, ...props }) {
	return /* @__PURE__ */ jsx(asChild ? Slot.Root : "button", {
		"data-slot": "button",
		"data-variant": variant,
		"data-size": size,
		className: cn(buttonVariants({
			variant,
			size,
			className
		})),
		...props
	});
}
//#endregion
//#region src/components/ui/avatar.tsx
function Avatar$1({ className, size = "default", ...props }) {
	return /* @__PURE__ */ jsx(Avatar.Root, {
		"data-slot": "avatar",
		"data-size": size,
		className: cn("group/avatar relative flex size-8 shrink-0 overflow-hidden rounded-full select-none data-[size=lg]:size-10 data-[size=sm]:size-6", className),
		...props
	});
}
function AvatarFallback({ className, ...props }) {
	return /* @__PURE__ */ jsx(Avatar.Fallback, {
		"data-slot": "avatar-fallback",
		className: cn("flex size-full items-center justify-center rounded-full bg-muted text-sm text-muted-foreground group-data-[size=sm]/avatar:text-xs", className),
		...props
	});
}
//#endregion
//#region src/utils.ts
function formatTime(ts) {
	try {
		return new Date(ts).toLocaleTimeString("vi-VN", {
			hour: "2-digit",
			minute: "2-digit"
		});
	} catch {
		return "";
	}
}
function formatSize(bytes) {
	if (!bytes) return "";
	if (bytes < 1024) return `${bytes} B`;
	if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
	return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}
function getInitial(name) {
	return (name ?? "?").charAt(0).toUpperCase();
}
function getContactDisplayName(contact) {
	return contact.hubAlias?.trim() || contact.zaloAlias?.trim() || contact.zaloName?.trim() || contact.phoneNumber?.trim() || contact.displayName?.trim() || contact.userId;
}
function getAccountDisplayName(account) {
	return account.hubAlias?.trim() || account.displayName?.trim() || account.phoneNumber?.trim() || account.accountId;
}
function directConversationId(contactId) {
	return `direct:${contactId}`;
}
function groupConversationId(groupId) {
	return `group:${groupId}`;
}
function getFileIcon(msg, fileName, mimeType) {
	const lowerName = (fileName ?? "").toLowerCase();
	const lowerMime = (mimeType ?? "").toLowerCase();
	if (msg.kind === "video" || lowerMime.startsWith("video/")) return "🎬";
	if (lowerMime.includes("pdf") || lowerName.endsWith(".pdf")) return "📕";
	if (lowerMime.includes("sheet") || lowerName.endsWith(".xlsx") || lowerName.endsWith(".xls") || lowerName.endsWith(".csv")) return "📊";
	if (lowerMime.includes("word") || lowerName.endsWith(".doc") || lowerName.endsWith(".docx") || lowerName.endsWith(".txt")) return "📄";
	if (lowerName.endsWith(".zip") || lowerName.endsWith(".rar") || lowerName.endsWith(".7z")) return "🗜️";
	if (lowerMime.startsWith("image/")) return "🖼️";
	return "📎";
}
function isVideoAttachment(msg, fileName, mimeType) {
	const lowerName = (fileName ?? "").toLowerCase();
	const lowerMime = (mimeType ?? "").toLowerCase();
	return msg.kind === "video" || lowerMime.startsWith("video/") || lowerName.endsWith(".mp4") || lowerName.endsWith(".mov") || lowerName.endsWith(".webm");
}
function isImageAttachment(msg, fileName, mimeType) {
	const lowerName = (fileName ?? "").toLowerCase();
	const lowerMime = (mimeType ?? "").toLowerCase();
	return msg.kind === "image" || lowerMime.startsWith("image/") || lowerName.endsWith(".png") || lowerName.endsWith(".jpg") || lowerName.endsWith(".jpeg") || lowerName.endsWith(".gif") || lowerName.endsWith(".webp");
}
//#endregion
//#region src/features/chat/components/MiniSidebar.tsx
function MiniSidebar({ accounts, selectedAccountId, currentAccountId, conversations, onSelectAccount, onOpenAdmin }) {
	const visibleAccounts = accounts.filter((a) => a.visible !== false);
	const getAccountUnreadCount = (accountId) => {
		return conversations.filter((c) => c.accountId === accountId).reduce((sum, c) => sum + (c.unreadCount || 0), 0);
	};
	return /* @__PURE__ */ jsxs("div", {
		className: "w-[72px] min-w-[72px] border-r border-[var(--border)] bg-[#0d1219] flex flex-col items-center gap-[14px] p-[14px_10px]",
		children: [
			/* @__PURE__ */ jsxs(Tooltip$1, { children: [/* @__PURE__ */ jsx(TooltipTrigger, {
				asChild: true,
				children: /* @__PURE__ */ jsx("button", {
					type: "button",
					onClick: onOpenAdmin,
					className: "w-11 h-11 rounded-2xl border border-[rgba(95,212,255,0.22)] bg-[rgba(79,122,255,0.16)] text-[#8ec5ff] inline-flex items-center justify-center cursor-pointer text-2xl font-medium transition-all duration-[0.12s] hover:-translate-y-px hover:border-white/18 hover:bg-white/7",
					children: "+"
				})
			}), /* @__PURE__ */ jsx(TooltipContent, {
				side: "right",
				children: "Quản lý tài khoản"
			})] }),
			/* @__PURE__ */ jsx("div", {
				className: "flex-1 flex flex-col items-center gap-[10px] w-full",
				children: visibleAccounts.map((account) => {
					const isCurrent = account.sessionActive === true;
					const isSelected = account.accountId === (selectedAccountId || currentAccountId);
					const isInactive = account.hasCredential === true && account.sessionActive !== true;
					const needsLogin = account.hasCredential === false;
					const label = getAccountDisplayName(account);
					const subtitle = account.phoneNumber;
					const unreadCount = getAccountUnreadCount(account.accountId);
					return /* @__PURE__ */ jsxs(Tooltip$1, { children: [/* @__PURE__ */ jsx(TooltipTrigger, {
						asChild: true,
						children: /* @__PURE__ */ jsxs("button", {
							type: "button",
							className: cn("relative w-11 h-11 rounded-2xl border border-white/8 bg-white/4 text-[#d9e4ff] inline-flex items-center justify-center cursor-pointer transition-all duration-[0.12s] hover:-translate-y-px hover:border-white/18 hover:bg-white/7", isSelected && "bg-[rgba(79,122,255,0.18)] border-[rgba(95,212,255,0.34)] shadow-[inset_0_0_0_1px_rgba(95,212,255,0.14)]"),
							onClick: () => onSelectAccount(account.accountId),
							children: [
								/* @__PURE__ */ jsxs(Avatar$1, {
									className: "w-8 h-8 rounded-xl",
									children: [account.avatar ? /* @__PURE__ */ jsx("img", {
										src: account.avatar,
										alt: label,
										className: "w-full h-full object-cover rounded-xl"
									}) : null, /* @__PURE__ */ jsx(AvatarFallback, {
										className: "bg-gradient-to-br from-[#4f7aff] to-[#5fd4ff] text-[#08101d] text-sm font-extrabold rounded-xl",
										children: getInitial(label)
									})]
								}),
								isCurrent && /* @__PURE__ */ jsx("span", { className: "absolute right-1 bottom-1 w-2 h-2 rounded-full bg-[#54da88] shadow-[0_0_0_2px_#0d1219]" }),
								isInactive && /* @__PURE__ */ jsx("span", { className: "absolute right-1 bottom-1 w-2 h-2 rounded-full bg-amber-400 shadow-[0_0_0_2px_#0d1219]" }),
								needsLogin && /* @__PURE__ */ jsx("span", { className: "absolute right-1 bottom-1 w-2 h-2 rounded-full bg-slate-500 shadow-[0_0_0_2px_#0d1219]" }),
								unreadCount > 0 && /* @__PURE__ */ jsx("span", {
									className: "absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1.5 text-[10px] font-bold text-white bg-red-500 rounded-full flex items-center justify-center shadow-[0_0_0_2px_#0d1219]",
									children: unreadCount > 99 ? "99+" : unreadCount
								})
							]
						})
					}), /* @__PURE__ */ jsx(TooltipContent, {
						side: "right",
						children: /* @__PURE__ */ jsxs("div", {
							className: "text-xs",
							children: [
								/* @__PURE__ */ jsx("div", {
									className: "font-medium",
									children: label
								}),
								subtitle && /* @__PURE__ */ jsx("div", {
									className: "text-muted-foreground",
									children: subtitle
								}),
								isCurrent && /* @__PURE__ */ jsx("div", {
									className: "text-emerald-400 font-medium mt-1",
									children: "Đang hoạt động"
								}),
								isInactive && /* @__PURE__ */ jsx("div", {
									className: "text-amber-400 font-medium mt-1",
									children: "Có credential nhưng chưa active"
								}),
								needsLogin && /* @__PURE__ */ jsx("div", {
									className: "text-slate-400 font-medium mt-1",
									children: "Chưa đăng nhập"
								}),
								unreadCount > 0 && /* @__PURE__ */ jsxs("div", {
									className: "text-red-400 font-bold mt-1",
									children: [unreadCount, " tin chưa đọc"]
								})
							]
						})
					})] }, account.accountId);
				})
			}),
			/* @__PURE__ */ jsxs(Tooltip$1, { children: [/* @__PURE__ */ jsx(TooltipTrigger, {
				asChild: true,
				children: /* @__PURE__ */ jsx(Button, {
					type: "button",
					variant: "ghost",
					size: "icon",
					onClick: onOpenAdmin,
					className: "w-11 h-11 rounded-2xl border border-white/8 bg-white/4 text-[#c9d6f3] hover:bg-white/8 hover:text-white",
					children: "⚙"
				})
			}), /* @__PURE__ */ jsx(TooltipContent, {
				side: "right",
				children: "Quản trị hệ thống"
			})] })
		]
	});
}
//#endregion
//#region src/components/ui/dialog.tsx
function Dialog$1({ ...props }) {
	return /* @__PURE__ */ jsx(Dialog.Root, {
		"data-slot": "dialog",
		...props
	});
}
function DialogPortal({ ...props }) {
	return /* @__PURE__ */ jsx(Dialog.Portal, {
		"data-slot": "dialog-portal",
		...props
	});
}
function DialogOverlay({ className, ...props }) {
	return /* @__PURE__ */ jsx(Dialog.Overlay, {
		"data-slot": "dialog-overlay",
		className: cn("fixed inset-0 z-50 bg-black/50 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:animate-in data-[state=open]:fade-in-0", className),
		...props
	});
}
function DialogContent({ className, children, showCloseButton = true, ...props }) {
	return /* @__PURE__ */ jsxs(DialogPortal, {
		"data-slot": "dialog-portal",
		children: [/* @__PURE__ */ jsx(DialogOverlay, {}), /* @__PURE__ */ jsxs(Dialog.Content, {
			"data-slot": "dialog-content",
			className: cn("fixed top-[50%] left-[50%] z-50 grid w-full max-w-[calc(100%-2rem)] translate-x-[-50%] translate-y-[-50%] gap-4 rounded-lg border bg-background p-6 shadow-lg duration-200 outline-none data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95 data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95 sm:max-w-lg", className),
			...props,
			children: [children, showCloseButton && /* @__PURE__ */ jsxs(Dialog.Close, {
				"data-slot": "dialog-close",
				className: "absolute top-4 right-4 rounded-xs opacity-70 ring-offset-background transition-opacity hover:opacity-100 focus:ring-2 focus:ring-ring focus:ring-offset-2 focus:outline-hidden disabled:pointer-events-none data-[state=open]:bg-accent data-[state=open]:text-muted-foreground [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
				children: [/* @__PURE__ */ jsx(XIcon, {}), /* @__PURE__ */ jsx("span", {
					className: "sr-only",
					children: "Close"
				})]
			})]
		})]
	});
}
function DialogHeader({ className, ...props }) {
	return /* @__PURE__ */ jsx("div", {
		"data-slot": "dialog-header",
		className: cn("flex flex-col gap-2 text-center sm:text-left", className),
		...props
	});
}
function DialogFooter({ className, showCloseButton = false, children, ...props }) {
	return /* @__PURE__ */ jsxs("div", {
		"data-slot": "dialog-footer",
		className: cn("flex flex-col-reverse gap-2 sm:flex-row sm:justify-end", className),
		...props,
		children: [children, showCloseButton && /* @__PURE__ */ jsx(Dialog.Close, {
			asChild: true,
			children: /* @__PURE__ */ jsx(Button, {
				variant: "outline",
				children: "Close"
			})
		})]
	});
}
function DialogTitle({ className, ...props }) {
	return /* @__PURE__ */ jsx(Dialog.Title, {
		"data-slot": "dialog-title",
		className: cn("text-lg leading-none font-semibold", className),
		...props
	});
}
function DialogDescription({ className, ...props }) {
	return /* @__PURE__ */ jsx(Dialog.Description, {
		"data-slot": "dialog-description",
		className: cn("text-sm text-muted-foreground", className),
		...props
	});
}
//#endregion
//#region src/components/ui/input.tsx
function Input({ className, type, ...props }) {
	return /* @__PURE__ */ jsx("input", {
		type,
		"data-slot": "input",
		className: cn("h-9 w-full min-w-0 rounded-md border border-input bg-transparent px-3 py-1 text-base shadow-xs transition-[color,box-shadow] outline-none selection:bg-primary selection:text-primary-foreground file:inline-flex file:h-7 file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 md:text-sm dark:bg-input/30", "focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50", "aria-invalid:border-destructive aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40", className),
		...props
	});
}
//#endregion
//#region src/components/ui/tabs.tsx
function Tabs$1({ className, orientation = "horizontal", ...props }) {
	return /* @__PURE__ */ jsx(Tabs.Root, {
		"data-slot": "tabs",
		"data-orientation": orientation,
		orientation,
		className: cn("group/tabs flex gap-2 data-[orientation=horizontal]:flex-col", className),
		...props
	});
}
var tabsListVariants = cva("group/tabs-list inline-flex w-fit items-center justify-center rounded-lg p-[3px] text-muted-foreground group-data-[orientation=horizontal]/tabs:h-9 group-data-[orientation=vertical]/tabs:h-fit group-data-[orientation=vertical]/tabs:flex-col data-[variant=line]:rounded-none", {
	variants: { variant: {
		default: "bg-muted",
		line: "gap-1 bg-transparent"
	} },
	defaultVariants: { variant: "default" }
});
function TabsList({ className, variant = "default", ...props }) {
	return /* @__PURE__ */ jsx(Tabs.List, {
		"data-slot": "tabs-list",
		"data-variant": variant,
		className: cn(tabsListVariants({ variant }), className),
		...props
	});
}
function TabsTrigger({ className, ...props }) {
	return /* @__PURE__ */ jsx(Tabs.Trigger, {
		"data-slot": "tabs-trigger",
		className: cn("relative inline-flex h-[calc(100%-1px)] flex-1 items-center justify-center gap-1.5 rounded-md border border-transparent px-2 py-1 text-sm font-medium whitespace-nowrap text-foreground/60 transition-all group-data-[orientation=vertical]/tabs:w-full group-data-[orientation=vertical]/tabs:justify-start hover:text-foreground focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-1 focus-visible:outline-ring disabled:pointer-events-none disabled:opacity-50 group-data-[variant=default]/tabs-list:data-[state=active]:shadow-sm group-data-[variant=line]/tabs-list:data-[state=active]:shadow-none dark:text-muted-foreground dark:hover:text-foreground [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4", "group-data-[variant=line]/tabs-list:bg-transparent group-data-[variant=line]/tabs-list:data-[state=active]:bg-transparent dark:group-data-[variant=line]/tabs-list:data-[state=active]:border-transparent dark:group-data-[variant=line]/tabs-list:data-[state=active]:bg-transparent", "data-[state=active]:bg-background data-[state=active]:text-foreground dark:data-[state=active]:border-input dark:data-[state=active]:bg-input/30 dark:data-[state=active]:text-foreground", "after:absolute after:bg-foreground after:opacity-0 after:transition-opacity group-data-[orientation=horizontal]/tabs:after:inset-x-0 group-data-[orientation=horizontal]/tabs:after:bottom-[-5px] group-data-[orientation=horizontal]/tabs:after:h-0.5 group-data-[orientation=vertical]/tabs:after:inset-y-0 group-data-[orientation=vertical]/tabs:after:-right-1 group-data-[orientation=vertical]/tabs:after:w-0.5 group-data-[variant=line]/tabs-list:data-[state=active]:after:opacity-100", className),
		...props
	});
}
//#endregion
//#region src/features/chat/components/Sidebar.tsx
function Sidebar({ sidebarTab, onTabChange, query, onQueryChange, conversations, contacts, groups, activeConversationId, workspaceAccountId, accountHubAlias, accountDisplayName, accountAvatar, accountPhoneNumber, className, onRenameAccount, onSelectConversation, onOpenDirectConversation, onOpenGroupConversation }) {
	const [renameOpen, setRenameOpen] = useState(false);
	const [renameValue, setRenameValue] = useState(accountHubAlias ?? "");
	const [renaming, setRenaming] = useState(false);
	const resolvedAccountLabel = getAccountDisplayName({
		accountId: workspaceAccountId,
		hubAlias: accountHubAlias,
		displayName: accountDisplayName,
		phoneNumber: accountPhoneNumber
	});
	const resolvedAccountSubLabel = accountPhoneNumber?.trim() || workspaceAccountId || "Chưa có thông tin phụ";
	useEffect(() => {
		setRenameValue(accountHubAlias ?? "");
	}, [accountHubAlias, workspaceAccountId]);
	const submitRename = async (e) => {
		e.preventDefault();
		const nextValue = renameValue.trim();
		if (!nextValue || renaming) return;
		setRenaming(true);
		try {
			await onRenameAccount(nextValue);
			setRenameOpen(false);
		} finally {
			setRenaming(false);
		}
	};
	return /* @__PURE__ */ jsxs("div", {
		className: cn("w-[300px] min-w-[280px] border-r border-[var(--sidebar-border)] flex flex-col bg-[var(--sidebar)] overflow-hidden max-sm:w-[260px] max-sm:min-w-[240px]", className),
		children: [
			/* @__PURE__ */ jsx("div", {
				className: "px-3.5 pt-3.5 pb-2.5 border-b border-[var(--sidebar-border)]",
				children: /* @__PURE__ */ jsx("div", {
					className: "rounded-2xl border border-white/8 bg-white/[0.03] px-3 py-3",
					children: /* @__PURE__ */ jsxs("div", {
						className: "flex items-center gap-3",
						children: [/* @__PURE__ */ jsxs(Avatar$1, {
							className: "w-10 h-10 rounded-xl shrink-0",
							children: [accountAvatar ? /* @__PURE__ */ jsx("img", {
								src: accountAvatar,
								alt: resolvedAccountLabel,
								className: "w-full h-full object-cover rounded-xl"
							}) : null, /* @__PURE__ */ jsx(AvatarFallback, {
								className: "bg-gradient-to-br from-[#4f7aff] to-[#5fd4ff] text-[#08101d] text-sm font-extrabold rounded-xl",
								children: getInitial(resolvedAccountLabel)
							})]
						}), /* @__PURE__ */ jsxs("div", {
							className: "min-w-0 flex-1",
							children: [/* @__PURE__ */ jsxs("div", {
								className: "flex items-center gap-2 min-w-0",
								children: [/* @__PURE__ */ jsx("div", {
									className: "text-sm font-semibold text-[#eef2ff] truncate",
									children: resolvedAccountLabel
								}), /* @__PURE__ */ jsx("button", {
									type: "button",
									onClick: () => setRenameOpen(true),
									className: "shrink-0 text-[11px] text-muted-foreground hover:text-[#9fc0ff] transition-colors",
									title: "Đổi tên account",
									children: "✎"
								})]
							}), /* @__PURE__ */ jsx("div", {
								className: "text-[11px] text-muted-foreground truncate mt-1",
								children: resolvedAccountSubLabel
							})]
						})]
					})
				})
			}),
			/* @__PURE__ */ jsx(Dialog$1, {
				open: renameOpen,
				onOpenChange: setRenameOpen,
				children: /* @__PURE__ */ jsx(DialogContent, { children: /* @__PURE__ */ jsxs("form", {
					onSubmit: submitRename,
					className: "space-y-4",
					children: [
						/* @__PURE__ */ jsxs(DialogHeader, { children: [/* @__PURE__ */ jsx(DialogTitle, { children: "Đổi tên account" }), /* @__PURE__ */ jsxs(DialogDescription, { children: [
							"Alias nội bộ sẽ ưu tiên hiển thị thay cho tên Zalo của account `",
							workspaceAccountId,
							"`."
						] })] }),
						/* @__PURE__ */ jsx(Input, {
							value: renameValue,
							onChange: (event) => setRenameValue(event.target.value),
							placeholder: "Nhập alias nội bộ cho account",
							autoFocus: true
						}),
						/* @__PURE__ */ jsxs(DialogFooter, { children: [/* @__PURE__ */ jsx(Button, {
							type: "button",
							variant: "outline",
							onClick: () => setRenameOpen(false),
							disabled: renaming,
							children: "Hủy"
						}), /* @__PURE__ */ jsx(Button, {
							type: "submit",
							disabled: renaming || !renameValue.trim(),
							children: renaming ? "Đang lưu..." : "Lưu"
						})] })
					]
				}) })
			}),
			/* @__PURE__ */ jsx(Tabs$1, {
				value: sidebarTab,
				onValueChange: (v) => onTabChange(v),
				className: "px-3.5 pt-3 pb-1.5",
				children: /* @__PURE__ */ jsxs(TabsList, {
					className: "w-full",
					children: [
						/* @__PURE__ */ jsx(TabsTrigger, {
							value: "conversations",
							className: "flex-1",
							children: "Cuộc trò chuyện"
						}),
						/* @__PURE__ */ jsx(TabsTrigger, {
							value: "contacts",
							className: "flex-1",
							children: "Bạn bè"
						}),
						/* @__PURE__ */ jsx(TabsTrigger, {
							value: "groups",
							className: "flex-1",
							children: "Nhóm"
						})
					]
				})
			}),
			/* @__PURE__ */ jsx("div", {
				className: "px-3.5 pb-2.5",
				children: /* @__PURE__ */ jsx(Input, {
					value: query,
					onChange: (event) => onQueryChange(event.target.value),
					placeholder: sidebarTab === "conversations" ? "Tìm cuộc trò chuyện..." : sidebarTab === "contacts" ? "Tìm bạn bè..." : "Tìm nhóm...",
					className: "h-10"
				})
			}),
			/* @__PURE__ */ jsxs("div", {
				className: "flex-1 min-h-0 overflow-y-auto",
				children: [
					sidebarTab === "conversations" && conversations.map((entry) => (() => {
						const resolvedContact = entry.type === "direct" ? contacts.find((contact) => contact.userId === entry.threadId) : void 0;
						const resolvedGroup = entry.type === "group" ? groups.find((group) => group.groupId === entry.threadId) : void 0;
						const resolvedTitle = resolvedContact ? getContactDisplayName(resolvedContact) : resolvedGroup?.displayName ?? entry.title;
						const resolvedAvatar = resolvedContact?.avatar ?? resolvedGroup?.avatar ?? entry.avatar;
						const isActive = activeConversationId === entry.id;
						const showUnread = !isActive && (entry.unreadCount ?? 0) > 0;
						return /* @__PURE__ */ jsxs("div", {
							onClick: () => onSelectConversation(entry.id),
							className: `flex items-center gap-3 px-4 py-3 cursor-pointer border-b border-white/4 transition-colors hover:bg-white/4 ${isActive ? "bg-[rgba(79,122,255,0.12)]" : ""}`,
							children: [/* @__PURE__ */ jsxs(Avatar$1, {
								className: "w-[42px] h-[42px] rounded-full shrink-0",
								children: [resolvedAvatar ? /* @__PURE__ */ jsx("img", {
									src: resolvedAvatar,
									alt: resolvedTitle,
									className: "w-full h-full object-cover rounded-full"
								}) : null, /* @__PURE__ */ jsx(AvatarFallback, {
									className: "bg-gradient-to-br from-[#4f7aff] to-[#5fd4ff] text-[#0a1020] text-base font-bold",
									children: getInitial(resolvedTitle)
								})]
							}), /* @__PURE__ */ jsxs("div", {
								className: "flex-1 min-w-0",
								children: [/* @__PURE__ */ jsxs("div", {
									className: "flex items-center gap-2",
									children: [/* @__PURE__ */ jsxs("span", {
										className: `text-sm truncate ${showUnread ? "font-bold text-white" : "font-semibold text-[#eee]"}`,
										children: [resolvedTitle, entry.type === "group" ? " (Nhóm)" : ""]
									}), showUnread && /* @__PURE__ */ jsx("span", {
										className: "shrink-0 inline-flex items-center justify-center min-w-[18px] h-[18px] px-1.5 text-[10px] font-bold text-white bg-[#4f7aff] rounded-full leading-none",
										children: entry.unreadCount > 99 ? "99+" : entry.unreadCount
									})]
								}), /* @__PURE__ */ jsxs("div", {
									className: "text-xs text-[#666] mt-0.5 truncate",
									children: [
										entry.lastDirection === "outgoing" ? "Bạn: " : "",
										entry.lastMessageKind !== "text" ? `[${entry.lastMessageKind}] ` : "",
										entry.lastMessageText
									]
								})]
							})]
						}, entry.id);
					})()),
					sidebarTab === "contacts" && contacts.map((entry) => {
						const contactConvId = directConversationId(entry.userId);
						const contactUnread = conversations.find((c) => c.id === contactConvId)?.unreadCount || 0;
						const isActive = activeConversationId === contactConvId;
						return /* @__PURE__ */ jsxs("div", {
							onClick: () => onOpenDirectConversation(entry),
							className: `flex items-center gap-3 px-4 py-3 cursor-pointer border-b border-white/4 transition-colors hover:bg-white/4 ${isActive ? "bg-[rgba(79,122,255,0.12)]" : ""}`,
							children: [/* @__PURE__ */ jsxs(Avatar$1, {
								className: "w-[42px] h-[42px] rounded-full shrink-0",
								children: [entry.avatar ? /* @__PURE__ */ jsx("img", {
									src: entry.avatar,
									alt: getContactDisplayName(entry),
									className: "w-full h-full object-cover rounded-full"
								}) : null, /* @__PURE__ */ jsx(AvatarFallback, {
									className: "bg-gradient-to-br from-[#4f7aff] to-[#5fd4ff] text-[#0a1020] text-base font-bold",
									children: getInitial(getContactDisplayName(entry))
								})]
							}), /* @__PURE__ */ jsxs("div", {
								className: "flex-1 min-w-0",
								children: [/* @__PURE__ */ jsxs("div", {
									className: "flex items-center gap-2",
									children: [/* @__PURE__ */ jsx("span", {
										className: `text-sm truncate ${contactUnread > 0 && !isActive ? "font-bold text-white" : "font-semibold text-[#eee]"}`,
										children: getContactDisplayName(entry)
									}), contactUnread > 0 && !isActive && /* @__PURE__ */ jsx("span", {
										className: "shrink-0 inline-flex items-center justify-center min-w-[18px] h-[18px] px-1.5 text-[10px] font-bold text-white bg-[#4f7aff] rounded-full leading-none",
										children: contactUnread > 99 ? "99+" : contactUnread
									})]
								}), /* @__PURE__ */ jsx("div", {
									className: "text-xs text-[#666] mt-0.5 truncate",
									children: "Nhấn để mở chat"
								})]
							})]
						}, entry.userId);
					}),
					sidebarTab === "groups" && groups.map((entry) => /* @__PURE__ */ jsxs("div", {
						onClick: () => onOpenGroupConversation(entry),
						className: `flex items-center gap-3 px-4 py-3 cursor-pointer border-b border-white/4 transition-colors hover:bg-white/4 ${activeConversationId === groupConversationId(entry.groupId) ? "bg-[rgba(79,122,255,0.12)]" : ""}`,
						children: [/* @__PURE__ */ jsxs(Avatar$1, {
							className: "w-[42px] h-[42px] rounded-full shrink-0",
							children: [entry.avatar ? /* @__PURE__ */ jsx("img", {
								src: entry.avatar,
								alt: entry.displayName,
								className: "w-full h-full object-cover rounded-full"
							}) : null, /* @__PURE__ */ jsx(AvatarFallback, {
								className: "bg-gradient-to-br from-[#4f7aff] to-[#5fd4ff] text-[#0a1020] text-base font-bold",
								children: getInitial(entry.displayName)
							})]
						}), /* @__PURE__ */ jsxs("div", {
							className: "flex-1 min-w-0",
							children: [/* @__PURE__ */ jsx("div", {
								className: "text-sm font-semibold text-[#eee] truncate",
								children: entry.displayName
							}), /* @__PURE__ */ jsx("div", {
								className: "text-xs text-[#666] mt-0.5 truncate",
								children: entry.memberCount ? `${entry.memberCount} thành viên` : "Nhấn để mở nhóm chat"
							})]
						})]
					}, entry.groupId))
				]
			})
		]
	});
}
//#endregion
//#region src/components/ui/textarea.tsx
function Textarea({ className, ...props }) {
	return /* @__PURE__ */ jsx("textarea", {
		"data-slot": "textarea",
		className: cn("flex field-sizing-content min-h-16 w-full rounded-md border border-input bg-transparent px-3 py-2 text-base shadow-xs transition-[color,box-shadow] outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-destructive/20 md:text-sm dark:bg-input/30 dark:aria-invalid:ring-destructive/40", className),
		...props
	});
}
//#endregion
//#region src/features/chat/components/MessageBubble.tsx
var REACTION_OPTIONS = [
	{
		emoji: "❤️",
		icon: "/-heart"
	},
	{
		emoji: "👍",
		icon: "/-strong"
	},
	{
		emoji: "😆",
		icon: ":>"
	},
	{
		emoji: "😮",
		icon: ":o"
	},
	{
		emoji: "😢",
		icon: ":-(("
	},
	{
		emoji: "😡",
		icon: ":-h"
	}
];
function MessageBubble({ msg, isGroup, onReact, onOpenLightbox }) {
	const dir = msg.direction;
	const att = msg.attachments?.[0];
	const imageUrl = att?.url ?? att?.thumbnailUrl ?? msg.imageUrl;
	const fallbackFileLabel = att?.fileName ?? msg.text ?? (msg.kind === "video" ? "Video" : "File");
	const fileIcon = getFileIcon(msg, att?.fileName, att?.mimeType);
	const hasAttachmentUrl = Boolean(att?.url);
	const shouldRenderImage = Boolean(imageUrl && isImageAttachment(msg, att?.fileName, att?.mimeType));
	const shouldRenderVideo = Boolean(att?.url && isVideoAttachment(msg, att?.fileName, att?.mimeType));
	const shouldRenderFile = Boolean(att && !shouldRenderImage && !shouldRenderVideo);
	const isSticker = msg.kind === "sticker";
	const quoteLabel = msg.quote?.senderName ?? msg.quote?.senderId ?? "Tin nhắn gốc";
	const quoteText = msg.quote?.text?.trim() || (msg.quote?.kind ? `[${msg.quote.kind}]` : "Tin nhắn đã trả lời");
	const canReact = Boolean(onReact && msg.providerMessageId && msg.kind !== "reaction");
	const defaultReaction = REACTION_OPTIONS[1];
	const reactionDock = canReact ? /* @__PURE__ */ jsx("div", {
		className: `pointer-events-none absolute top-full z-10 mt-0.5 flex items-center opacity-0 transition-opacity duration-150 group-hover:pointer-events-auto group-hover:opacity-100 group-focus-within:pointer-events-auto group-focus-within:opacity-100 ${dir === "outgoing" ? "right-0 justify-end" : "left-0 justify-start"}`,
		children: /* @__PURE__ */ jsxs("div", {
			className: "group/reaction relative flex items-center",
			children: [/* @__PURE__ */ jsx("button", {
				type: "button",
				className: "h-6 w-6 rounded-full text-[13px] text-[rgba(255,255,255,0.20)] transition hover:text-[rgba(255,255,255,0.55)] hover:bg-white/5 focus-visible:text-[rgba(255,255,255,0.55)] focus-visible:outline-none",
				onClick: () => onReact?.(msg, defaultReaction),
				title: "Thả thích",
				children: "👍"
			}), /* @__PURE__ */ jsx("div", {
				className: `pointer-events-none absolute top-1/2 -translate-y-1/2 opacity-0 transition-all duration-150 group-hover/reaction:pointer-events-auto group-hover/reaction:opacity-100 group-focus-within/reaction:pointer-events-auto group-focus-within/reaction:opacity-100 ${dir === "outgoing" ? "right-full mr-0.5" : "left-full ml-0.5"}`,
				children: /* @__PURE__ */ jsx("div", {
					className: "flex items-center gap-1 rounded-full border border-white/10 bg-[rgba(8,12,18,0.92)] px-1.5 py-1 shadow-lg backdrop-blur-sm",
					children: REACTION_OPTIONS.map((reaction) => /* @__PURE__ */ jsx("button", {
						type: "button",
						className: "h-7 w-7 rounded-full text-sm hover:bg-white/10",
						onClick: () => onReact?.(msg, reaction),
						title: `Thả cảm xúc ${reaction.emoji}`,
						children: reaction.emoji
					}, reaction.emoji))
				})
			})]
		})
	}) : null;
	const showText = msg.text && msg.text !== "[image]" && msg.text !== "[file]" && msg.text !== "[video]" && !isSticker;
	if (isSticker) {
		const stickerUrl = imageUrl || att?.url || "";
		return /* @__PURE__ */ jsx("div", {
			className: `flex flex-col ${dir === "outgoing" ? "items-end" : "items-start"}`,
			children: /* @__PURE__ */ jsxs("div", {
				className: "group relative max-w-[160px]",
				children: [
					isGroup && dir === "incoming" && msg.senderName && /* @__PURE__ */ jsx("div", {
						className: "text-xs text-[#667085] font-semibold mb-1",
						children: msg.senderName
					}),
					/* @__PURE__ */ jsx("img", {
						src: stickerUrl,
						alt: "Sticker",
						className: "w-full h-auto block"
					}),
					/* @__PURE__ */ jsx("div", {
						className: "text-[10px] text-[rgba(255,255,255,0.25)] mt-0.5 text-right",
						children: formatTime(msg.timestamp)
					}),
					reactionDock
				]
			})
		});
	}
	if (msg.kind === "poll") return /* @__PURE__ */ jsx("div", {
		className: `flex flex-col ${dir === "outgoing" ? "items-end" : "items-start"}`,
		children: /* @__PURE__ */ jsx("div", {
			className: "max-w-[72%] max-w-[480px]",
			children: /* @__PURE__ */ jsxs("div", {
				className: "group relative px-[14px] py-[10px] rounded-2xl text-sm leading-relaxed bg-[rgba(255,255,255,0.07)] border border-[rgba(255,255,255,0.1)] text-[#ddd] rounded-bl",
				children: [
					isGroup && dir === "incoming" && msg.senderName && /* @__PURE__ */ jsx("div", {
						className: "text-xs text-[#667085] font-semibold mb-1",
						children: msg.senderName
					}),
					/* @__PURE__ */ jsxs("div", {
						className: "font-semibold text-[#eee] mb-2",
						children: ["📊 ", msg.text]
					}),
					/* @__PURE__ */ jsx("div", {
						className: "flex flex-col gap-1.5",
						children: (msg.attachments || []).slice(0, 1).map((a, i) => /* @__PURE__ */ jsx("div", {
							className: "text-xs text-muted-foreground",
							children: a.fileName ? `Tùy chọn: ${a.fileName}` : "Xem chi tiết poll trên Zalo"
						}, i))
					}),
					/* @__PURE__ */ jsx("div", {
						className: "text-[11px] text-[rgba(255,255,255,0.35)] mt-2 text-right",
						children: formatTime(msg.timestamp)
					}),
					reactionDock
				]
			})
		})
	});
	if (msg.kind === "reaction") return /* @__PURE__ */ jsx("div", {
		className: "flex justify-center",
		children: /* @__PURE__ */ jsx("span", {
			className: "text-sm px-2 py-0.5 rounded-full bg-white/5 text-[#ccc]",
			children: msg.text
		})
	});
	return /* @__PURE__ */ jsx("div", {
		className: `flex flex-col ${dir === "outgoing" ? "items-end" : "items-start"}`,
		children: /* @__PURE__ */ jsx("div", {
			className: "max-w-[72%] max-w-[480px]",
			children: /* @__PURE__ */ jsxs("div", {
				className: `group relative px-[14px] py-[10px] rounded-2xl text-sm leading-relaxed break-words ${dir === "outgoing" ? "bg-[rgba(79,122,255,0.22)] border border-[rgba(79,122,255,0.35)] text-[#dde8ff] rounded-br" : "bg-[rgba(255,255,255,0.07)] border border-[rgba(255,255,255,0.1)] text-[#ddd] rounded-bl"}`,
				children: [
					isGroup && dir === "incoming" && msg.senderName && /* @__PURE__ */ jsx("div", {
						className: "text-xs text-[#667085] font-semibold mb-1",
						children: msg.senderName
					}),
					msg.quote && /* @__PURE__ */ jsxs("div", {
						className: `mb-2 rounded-xl border px-3 py-2 text-xs ${dir === "outgoing" ? "border-[rgba(159,192,255,0.25)] bg-[rgba(7,16,34,0.16)] text-[#d7e4ff]" : "border-white/8 bg-black/15 text-[#d7dbe5]"}`,
						children: [/* @__PURE__ */ jsx("div", {
							className: "font-semibold truncate",
							children: quoteLabel
						}), /* @__PURE__ */ jsx("div", {
							className: "mt-0.5 truncate opacity-80",
							children: quoteText
						})]
					}),
					shouldRenderImage ? /* @__PURE__ */ jsx("button", {
						type: "button",
						className: "cursor-pointer block w-full text-left",
						onClick: () => onOpenLightbox?.(msg.id),
						title: "Xem ảnh lớn",
						children: /* @__PURE__ */ jsx("img", {
							src: imageUrl,
							alt: msg.text || "Hình ảnh",
							className: "max-w-[240px] rounded-[10px] block"
						})
					}) : shouldRenderVideo && att?.url ? /* @__PURE__ */ jsxs("div", {
						className: "flex flex-col gap-2",
						children: [/* @__PURE__ */ jsx("video", {
							className: "max-w-[320px] w-full rounded-xl bg-black",
							controls: true,
							preload: "metadata",
							children: /* @__PURE__ */ jsx("source", {
								src: att.url,
								type: att.mimeType ?? "video/mp4"
							})
						}), /* @__PURE__ */ jsxs("div", {
							className: "flex gap-3 flex-wrap mt-1.5",
							children: [/* @__PURE__ */ jsx("a", {
								href: att.url,
								target: "_blank",
								rel: "noreferrer",
								className: "text-xs text-[#9fc0ff] no-underline hover:underline",
								children: "Mở video"
							}), /* @__PURE__ */ jsx("a", {
								href: att.url,
								download: att.fileName ?? "video",
								className: "text-xs text-[#9fc0ff] no-underline hover:underline",
								children: "Tải xuống"
							})]
						})]
					}) : shouldRenderFile && att ? /* @__PURE__ */ jsxs("div", {
						className: "flex items-start gap-2.5 p-2 bg-white/5 rounded-[10px] border border-white/8",
						children: [/* @__PURE__ */ jsx("span", {
							className: "text-[28px] leading-none",
							children: fileIcon
						}), /* @__PURE__ */ jsxs("div", { children: [
							/* @__PURE__ */ jsx("div", {
								className: "text-[13px] text-[#ddd] font-medium",
								children: hasAttachmentUrl ? /* @__PURE__ */ jsx("a", {
									href: att.url,
									target: "_blank",
									rel: "noreferrer",
									className: "text-inherit no-underline hover:underline",
									children: fallbackFileLabel
								}) : fallbackFileLabel
							}),
							/* @__PURE__ */ jsxs("div", {
								className: "flex items-center gap-2 mt-1",
								children: [att.mimeType && /* @__PURE__ */ jsx("span", {
									className: "text-[10px] font-bold text-[#8cb1ff] bg-[rgba(79,122,255,0.15)] border border-[rgba(79,122,255,0.22)] rounded-full px-1.5 py-0.5",
									children: att.mimeType.split("/").pop()?.toUpperCase()
								}), att.size && /* @__PURE__ */ jsx("div", {
									className: "text-[11px] text-[#666]",
									children: formatSize(att.size)
								})]
							}),
							hasAttachmentUrl && /* @__PURE__ */ jsxs("div", {
								className: "flex gap-3 flex-wrap mt-1.5",
								children: [/* @__PURE__ */ jsx("a", {
									href: att.url,
									target: "_blank",
									rel: "noreferrer",
									className: "text-xs text-[#9fc0ff] no-underline hover:underline",
									children: "Xem file"
								}), /* @__PURE__ */ jsx("a", {
									href: att.url,
									download: att.fileName ?? "download",
									className: "text-xs text-[#9fc0ff] no-underline hover:underline",
									children: "Tải xuống"
								})]
							})
						] })]
					}) : null,
					showText && /* @__PURE__ */ jsx("div", {
						className: att ? "mt-1.5" : "",
						children: msg.text
					}),
					msg.reactions && msg.reactions.length > 0 && /* @__PURE__ */ jsx("div", {
						className: "mt-2 flex flex-wrap gap-1.5",
						children: msg.reactions.map((reaction) => /* @__PURE__ */ jsxs("span", {
							className: "inline-flex items-center gap-1 rounded-full border border-white/10 bg-black/15 px-2 py-0.5 text-xs text-[#eef2ff]",
							children: [/* @__PURE__ */ jsx("span", { children: reaction.emoji }), /* @__PURE__ */ jsx("span", {
								className: "text-[11px] opacity-80",
								children: reaction.count
							})]
						}, `${reaction.emoji}-${reaction.count}`))
					}),
					/* @__PURE__ */ jsx("div", {
						className: "text-[11px] text-[rgba(255,255,255,0.35)] mt-1 text-right",
						children: formatTime(msg.timestamp)
					}),
					reactionDock
				]
			})
		})
	});
}
//#endregion
//#region src/features/chat/components/Lightbox.tsx
var MIN_ZOOM = .5;
var MAX_ZOOM = 5;
var ZOOM_STEP = .25;
function Lightbox({ images, index, open, onClose }) {
	const [currentIndex, setCurrentIndex] = useState(index);
	const [loaded, setLoaded] = useState(false);
	const [zoom, setZoom] = useState(1);
	const [pan, setPan] = useState({
		x: 0,
		y: 0
	});
	const [dragging, setDragging] = useState(false);
	const dragStart = useRef({
		x: 0,
		y: 0,
		panX: 0,
		panY: 0
	});
	const containerRef = useRef(null);
	const total = images.length;
	const item = images[currentIndex];
	useEffect(() => {
		if (open) {
			setCurrentIndex(index);
			setLoaded(false);
			setZoom(1);
			setPan({
				x: 0,
				y: 0
			});
		}
	}, [open, index]);
	const go = useCallback((dir) => {
		setLoaded(false);
		setZoom(1);
		setPan({
			x: 0,
			y: 0
		});
		setCurrentIndex((prev) => (prev + dir + total) % total);
	}, [total]);
	const toggleZoom = useCallback(() => {
		setZoom((z) => {
			if (z > 1.1) {
				setPan({
					x: 0,
					y: 0
				});
				return 1;
			}
			return 2;
		});
	}, []);
	const zoomIn = useCallback(() => {
		setZoom((z) => Math.min(z + ZOOM_STEP, MAX_ZOOM));
	}, []);
	const zoomOut = useCallback(() => {
		setZoom((z) => {
			const next = Math.max(z - ZOOM_STEP, MIN_ZOOM);
			if (next <= 1) setPan({
				x: 0,
				y: 0
			});
			return next;
		});
	}, []);
	useEffect(() => {
		if (!open) return;
		const onWheel = (e) => {
			e.preventDefault();
			if (e.ctrlKey || e.metaKey) setZoom((z) => Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, z - e.deltaY * .005)));
			else setPan((p) => ({
				x: p.x - e.deltaX,
				y: p.y - e.deltaY
			}));
		};
		const container = containerRef.current;
		container?.addEventListener("wheel", onWheel, { passive: false });
		return () => container?.removeEventListener("wheel", onWheel);
	}, [open]);
	const handleMouseDown = useCallback((e) => {
		if (zoom <= 1) return;
		setDragging(true);
		dragStart.current = {
			x: e.clientX,
			y: e.clientY,
			panX: pan.x,
			panY: pan.y
		};
	}, [zoom, pan]);
	const handleMouseMove = useCallback((e) => {
		if (!dragging) return;
		setPan({
			x: dragStart.current.panX + (e.clientX - dragStart.current.x),
			y: dragStart.current.panY + (e.clientY - dragStart.current.y)
		});
	}, [dragging]);
	const handleMouseUp = useCallback(() => setDragging(false), []);
	useEffect(() => {
		if (!open) return;
		const onKey = (e) => {
			if (e.key === "Escape") {
				onClose();
				return;
			}
			if (zoom > 1) return;
			if (e.key === "ArrowLeft") go(-1);
			if (e.key === "ArrowRight") go(1);
		};
		window.addEventListener("keydown", onKey);
		return () => window.removeEventListener("keydown", onKey);
	}, [
		open,
		go,
		onClose,
		zoom
	]);
	const handleDownload = useCallback(() => {
		if (!item?.url) return;
		const a = document.createElement("a");
		a.href = item.url;
		a.download = "image";
		a.target = "_blank";
		a.rel = "noreferrer";
		a.click();
	}, [item?.url]);
	const zoomPercent = Math.round(zoom * 100);
	return /* @__PURE__ */ jsx(Dialog$1, {
		open,
		onOpenChange: (o) => {
			if (!o) onClose();
		},
		children: /* @__PURE__ */ jsxs(DialogContent, {
			className: "max-w-[100vw] max-h-[100vh] w-screen h-screen p-0 gap-0 bg-black/98 border-0 rounded-none shadow-none [&>button:first-child]:hidden select-none",
			onPointerDownOutside: onClose,
			children: [
				/* @__PURE__ */ jsx("button", {
					type: "button",
					className: "absolute top-4 right-4 z-30 flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-white/80 hover:bg-white/20 hover:text-white transition",
					onClick: onClose,
					children: /* @__PURE__ */ jsx(XIcon, { className: "h-5 w-5" })
				}),
				/* @__PURE__ */ jsxs("div", {
					className: "absolute top-4 left-4 z-30 flex items-center gap-1.5",
					children: [
						/* @__PURE__ */ jsx("button", {
							type: "button",
							className: "flex h-9 w-9 items-center justify-center rounded-full bg-white/10 text-white/80 hover:bg-white/20 hover:text-white transition",
							onClick: zoomOut,
							title: "Thu nhỏ",
							children: /* @__PURE__ */ jsx(ZoomOutIcon, { className: "h-4 w-4" })
						}),
						/* @__PURE__ */ jsxs("button", {
							type: "button",
							className: "flex h-9 px-3 items-center justify-center rounded-full bg-white/10 text-white/80 hover:bg-white/20 hover:text-white transition text-xs font-medium min-w-[52px]",
							onClick: toggleZoom,
							title: "Bấm để khớp màn hình / phóng to",
							children: [zoomPercent, "%"]
						}),
						/* @__PURE__ */ jsx("button", {
							type: "button",
							className: "flex h-9 w-9 items-center justify-center rounded-full bg-white/10 text-white/80 hover:bg-white/20 hover:text-white transition",
							onClick: zoomIn,
							title: "Phóng to",
							children: /* @__PURE__ */ jsx(ZoomInIcon, { className: "h-4 w-4" })
						}),
						/* @__PURE__ */ jsx("button", {
							type: "button",
							className: "flex h-9 w-9 items-center justify-center rounded-full bg-white/10 text-white/80 hover:bg-white/20 hover:text-white transition",
							onClick: handleDownload,
							title: "Tải xuống",
							children: /* @__PURE__ */ jsx(DownloadIcon, { className: "h-4 w-4" })
						})
					]
				}),
				total > 1 && /* @__PURE__ */ jsxs(Fragment, { children: [/* @__PURE__ */ jsx("button", {
					type: "button",
					className: "absolute left-4 top-1/2 -translate-y-1/2 z-30 flex h-12 w-12 items-center justify-center rounded-full bg-white/10 text-white/80 hover:bg-white/20 hover:text-white transition",
					onClick: () => go(-1),
					children: /* @__PURE__ */ jsx(ChevronLeftIcon, { className: "h-6 w-6" })
				}), /* @__PURE__ */ jsx("button", {
					type: "button",
					className: "absolute right-4 top-1/2 -translate-y-1/2 z-30 flex h-12 w-12 items-center justify-center rounded-full bg-white/10 text-white/80 hover:bg-white/20 hover:text-white transition",
					onClick: () => go(1),
					children: /* @__PURE__ */ jsx(ChevronRightIcon, { className: "h-6 w-6" })
				})] }),
				/* @__PURE__ */ jsxs("div", {
					ref: containerRef,
					className: cn("absolute inset-0 flex items-center justify-center overflow-hidden", zoom > 1 && dragging ? "cursor-grabbing" : zoom > 1 ? "cursor-grab" : "cursor-default"),
					onMouseDown: handleMouseDown,
					onMouseMove: handleMouseMove,
					onMouseUp: handleMouseUp,
					onMouseLeave: handleMouseUp,
					onDoubleClick: toggleZoom,
					children: [!loaded && /* @__PURE__ */ jsx("div", {
						className: "absolute inset-0 flex items-center justify-center",
						children: /* @__PURE__ */ jsx("div", { className: "h-8 w-8 animate-spin rounded-full border-2 border-white/20 border-t-white/80" })
					}), item && /* @__PURE__ */ jsx("img", {
						src: item.url,
						alt: "",
						className: cn("transition-opacity duration-300", zoom <= 1 ? "max-w-full max-h-full w-auto h-auto object-contain" : "max-w-none max-h-none", loaded ? "opacity-100" : "opacity-0"),
						style: zoom > 1 ? {
							transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
							transformOrigin: "center center"
						} : void 0,
						onLoad: () => setLoaded(true),
						draggable: false
					})]
				}),
				/* @__PURE__ */ jsxs("div", {
					className: "absolute bottom-6 left-1/2 -translate-x-1/2 z-30 flex items-center gap-4",
					children: [total > 1 && /* @__PURE__ */ jsxs("span", {
						className: "text-sm text-white/50 bg-black/60 px-3 py-1.5 rounded-full",
						children: [
							currentIndex + 1,
							" / ",
							total
						]
					}), item?.senderName && /* @__PURE__ */ jsx("span", {
						className: "text-sm text-white/80 bg-black/60 px-3 py-1.5 rounded-full",
						children: item.senderName
					})]
				})
			]
		})
	});
}
//#endregion
//#region src/features/chat/components/ChatPanel.tsx
function ChatPanel({ activeConversationId, activeConversation, activeName, activeAvatar, activeSubtitle, isGroupConversation, headerLeading, messages, hasMoreHistory, loadingOlder, syncingHistory, statusMsg, loadError, showDisconnectBanner, text, attachFile, sending, typingUsers, detailsOpen, onScroll, onTextChange, onKeyDown, onSend, onAttachFile, onClearFile, onToggleDetails, onReactMessage }) {
	const messagesAreaRef = useRef(null);
	const messagesEndRef = useRef(null);
	const fileInputRef = useRef(null);
	const prevConversationRef = useRef(activeConversationId);
	const observerRef = useRef(null);
	const observerTimeoutRef = useRef(null);
	const userScrolledUpRef = useRef(false);
	const [lightboxIndex, setLightboxIndex] = useState(0);
	const [lightboxOpen, setLightboxOpen] = useState(false);
	const lightboxImages = useMemo(() => {
		const result = [];
		for (const msg of messages) {
			const att = msg.attachments?.[0];
			const imgUrl = att?.url ?? att?.thumbnailUrl ?? msg.imageUrl;
			if (imgUrl && isImageAttachment(msg, att?.fileName, att?.mimeType)) result.push({
				url: imgUrl,
				senderName: msg.senderName
			});
		}
		return result;
	}, [messages]);
	const lightboxMsgIdToIndex = useMemo(() => {
		const map = /* @__PURE__ */ new Map();
		let idx = 0;
		for (const msg of messages) {
			const att = msg.attachments?.[0];
			if ((att?.url ?? att?.thumbnailUrl ?? msg.imageUrl) && isImageAttachment(msg, att?.fileName, att?.mimeType)) {
				map.set(msg.id, idx);
				idx += 1;
			}
		}
		return map;
	}, [messages]);
	const openLightbox = useCallback((messageId) => {
		const idx = lightboxMsgIdToIndex.get(messageId);
		if (idx !== void 0) {
			setLightboxIndex(idx);
			setLightboxOpen(true);
		}
	}, [lightboxMsgIdToIndex]);
	useEffect(() => {
		const container = messagesAreaRef.current;
		if (!container) return;
		const isNewConversation = activeConversationId !== prevConversationRef.current;
		prevConversationRef.current = activeConversationId;
		if (isNewConversation) userScrolledUpRef.current = false;
		const scrollToBottom = () => {
			if (!messagesAreaRef.current || userScrolledUpRef.current) return;
			messagesAreaRef.current.scrollTop = messagesAreaRef.current.scrollHeight;
		};
		const cleanObserver = () => {
			if (observerRef.current) {
				observerRef.current.disconnect();
				observerRef.current = null;
			}
			if (observerTimeoutRef.current) {
				clearTimeout(observerTimeoutRef.current);
				observerTimeoutRef.current = null;
			}
		};
		cleanObserver();
		if (isNewConversation || messages.length > 0) {
			requestAnimationFrame(() => {
				requestAnimationFrame(scrollToBottom);
			});
			observerRef.current = new ResizeObserver(() => {
				scrollToBottom();
			});
			observerRef.current.observe(container);
			observerTimeoutRef.current = setTimeout(() => {
				cleanObserver();
			}, 8e3);
		}
		return cleanObserver;
	}, [activeConversationId, messages]);
	const handleScroll = (e) => {
		const container = e.currentTarget;
		if (!(container.scrollHeight - container.scrollTop - container.clientHeight < 80)) userScrolledUpRef.current = true;
		onScroll(e);
	};
	return /* @__PURE__ */ jsxs("div", {
		className: "flex-1 flex flex-col min-h-0",
		children: [!activeConversationId ? /* @__PURE__ */ jsx("div", {
			className: "flex-1 flex items-center justify-center text-[#555] text-sm",
			children: "Chọn một cuộc trò chuyện để bắt đầu"
		}) : /* @__PURE__ */ jsxs(Fragment, { children: [
			/* @__PURE__ */ jsxs("div", {
				className: "shrink-0 px-5 py-3.5 border-b border-[var(--border)] flex items-center gap-3",
				children: [
					headerLeading,
					/* @__PURE__ */ jsxs(Avatar$1, {
						className: "w-9 h-9 text-sm shrink-0",
						children: [activeAvatar ? /* @__PURE__ */ jsx("img", {
							src: activeAvatar,
							alt: activeName,
							className: "w-full h-full object-cover rounded-full"
						}) : null, /* @__PURE__ */ jsx(AvatarFallback, {
							className: "bg-gradient-to-br from-[#4f7aff] to-[#5fd4ff] text-[#0a1020] font-bold",
							children: getInitial(activeName)
						})]
					}),
					/* @__PURE__ */ jsxs("button", {
						type: "button",
						onClick: onToggleDetails,
						className: "min-w-0 flex-1 text-left rounded-lg px-1.5 py-1 -mx-1.5 hover:bg-white/4 transition-colors",
						title: "Xem thông tin hội thoại",
						children: [/* @__PURE__ */ jsx("div", {
							className: "text-[15px] font-bold text-[#eee] truncate",
							children: activeName
						}), typingUsers.length > 0 ? /* @__PURE__ */ jsx("div", {
							className: "text-xs text-[#7fa8ff] animate-pulse mt-0.5",
							children: typingUsers.length === 1 ? `${typingUsers[0]} đang nhập...` : `${typingUsers.length} người đang nhập...`
						}) : /* @__PURE__ */ jsx("div", {
							className: "text-xs text-muted-foreground mt-0.5 truncate",
							children: activeSubtitle || activeConversationId
						})]
					}),
					/* @__PURE__ */ jsx(Button, {
						type: "button",
						variant: "ghost",
						size: "sm",
						onClick: onToggleDetails,
						className: `text-xs shrink-0 h-7 ${detailsOpen ? "text-[#7fa8ff]" : "text-muted-foreground hover:text-[#7fa8ff]"}`,
						children: detailsOpen ? "Ẩn info" : "Info"
					})
				]
			}),
			(statusMsg || loadError) && /* @__PURE__ */ jsx("div", {
				className: `shrink-0 px-5 py-2.5 text-[13px] ${loadError ? "bg-[rgba(255,80,80,0.1)] text-[#ff9a9a]" : "bg-[rgba(60,200,120,0.1)] text-[#6fe0a0]"}`,
				children: loadError || statusMsg
			}),
			showDisconnectBanner && /* @__PURE__ */ jsx("div", {
				className: "shrink-0 px-5 py-2.5 text-[13px] bg-[rgba(255,160,60,0.1)] text-[#ffa03c] flex items-center justify-between",
				children: /* @__PURE__ */ jsxs("span", { children: [
					"⚠️ Tài khoản mất kết nối. Vào ",
					/* @__PURE__ */ jsx("a", {
						href: "/admin",
						className: "underline",
						children: "Admin"
					}),
					" để quét QR lại hoặc liên hệ master."
				] })
			}),
			/* @__PURE__ */ jsx("div", {
				className: "flex-1 min-h-0 overflow-visible px-4 pt-4 pb-10",
				children: /* @__PURE__ */ jsxs("div", {
					ref: messagesAreaRef,
					className: "h-full overflow-y-auto pr-1",
					onScroll: handleScroll,
					children: [
						hasMoreHistory && /* @__PURE__ */ jsx("div", {
							className: "mx-auto w-fit px-2.5 py-1.5 text-xs text-[#7b8597] bg-white/4 border border-white/6 rounded-full",
							children: loadingOlder || syncingHistory ? "Đang tải thêm tin cũ..." : "Kéo lên để tải thêm tin cũ"
						}),
						messages.length === 0 && !hasMoreHistory && /* @__PURE__ */ jsx("div", {
							className: "flex items-center justify-center h-full text-[#555] text-sm mt-8",
							children: "Chưa có tin nhắn. Hãy gửi tin nhắn đầu tiên!"
						}),
						/* @__PURE__ */ jsx("div", {
							className: "flex flex-col gap-1.5",
							children: messages.map((m) => /* @__PURE__ */ jsx(MessageBubble, {
								msg: m,
								isGroup: isGroupConversation,
								onReact: onReactMessage,
								onOpenLightbox: openLightbox
							}, m.id))
						}),
						/* @__PURE__ */ jsx("div", { ref: messagesEndRef })
					]
				})
			}),
			/* @__PURE__ */ jsxs("form", {
				className: "shrink-0 p-3.5 pb-4 border-t border-[var(--border)] flex flex-col gap-2.5 bg-[var(--card)]",
				onSubmit: onSend,
				children: [
					attachFile && /* @__PURE__ */ jsxs("div", {
						className: "flex items-center gap-2 px-2.5 py-1.5 bg-[rgba(79,122,255,0.1)] border border-[rgba(79,122,255,0.25)] rounded-[10px] text-xs text-[#7fa8ff]",
						children: [/* @__PURE__ */ jsxs("span", { children: [
							"📎 ",
							attachFile.name,
							" (",
							formatSize(attachFile.size),
							")"
						] }), /* @__PURE__ */ jsx("button", {
							type: "button",
							onClick: onClearFile,
							className: "ml-auto bg-none border-none text-[#ff8888] cursor-pointer text-sm p-0 leading-none",
							children: "✕"
						})]
					}),
					/* @__PURE__ */ jsxs("div", {
						className: "flex gap-2 items-end",
						children: [/* @__PURE__ */ jsx(Textarea, {
							placeholder: isGroupConversation ? "Nhập tin nhắn vào nhóm..." : "Nhập tin nhắn...",
							value: text,
							onChange: (e) => onTextChange(e.target.value),
							onKeyDown,
							rows: 1,
							className: "min-h-[58px] max-h-[160px] resize-none flex-1"
						}), /* @__PURE__ */ jsxs("div", {
							className: "flex gap-1.5 shrink-0",
							children: [/* @__PURE__ */ jsx(Button, {
								type: "button",
								variant: "ghost",
								size: "icon",
								title: "Đính kèm ảnh/file",
								onClick: () => fileInputRef.current?.click(),
								className: attachFile ? "border-[rgba(79,122,255,0.6)] text-[#7fa8ff] bg-[rgba(79,122,255,0.12)]" : "",
								children: "📎"
							}), /* @__PURE__ */ jsx(Button, {
								type: "submit",
								size: "icon",
								disabled: sending || !text.trim() && !attachFile,
								title: "Gửi",
								children: "➤"
							})]
						})]
					}),
					/* @__PURE__ */ jsx("input", {
						ref: fileInputRef,
						type: "file",
						accept: "image/*,.pdf,.doc,.docx,.xls,.xlsx,.zip,.rar,.txt,.mp4",
						className: "hidden",
						onChange: (e) => onAttachFile(e.target.files?.[0] ?? null)
					})
				]
			})
		] }), lightboxImages.length > 0 && /* @__PURE__ */ jsx(Lightbox, {
			images: lightboxImages,
			index: lightboxIndex,
			open: lightboxOpen,
			onClose: () => setLightboxOpen(false)
		})]
	});
}
//#endregion
//#region src/components/ui/separator.tsx
function Separator$1({ className, orientation = "horizontal", decorative = true, ...props }) {
	return /* @__PURE__ */ jsx(Separator.Root, {
		"data-slot": "separator",
		decorative,
		orientation,
		className: cn("shrink-0 bg-border data-[orientation=horizontal]:h-px data-[orientation=horizontal]:w-full data-[orientation=vertical]:h-full data-[orientation=vertical]:w-px", className),
		...props
	});
}
//#endregion
//#region src/features/chat/components/ConversationDetailsPanel.tsx
function DetailRow({ label, value }) {
	if (value === void 0 || value === null || value === "") return null;
	return /* @__PURE__ */ jsxs("div", {
		className: "flex flex-col gap-1",
		children: [/* @__PURE__ */ jsx("div", {
			className: "text-[11px] uppercase tracking-[0.08em] text-muted-foreground",
			children: label
		}), /* @__PURE__ */ jsx("div", {
			className: "text-sm text-[#e8ecf8] break-words",
			children: value
		})]
	});
}
function ConversationDetailsPanel({ open, conversation, contact, group, workspaceAccount, onClose }) {
	if (!open || !conversation) return null;
	const isGroup = conversation.type === "group";
	const title = contact ? getContactDisplayName(contact) : group?.displayName ?? conversation.title;
	const avatar = contact?.avatar ?? group?.avatar ?? conversation.avatar;
	return /* @__PURE__ */ jsxs("aside", {
		className: "w-[320px] max-w-[36vw] min-w-[280px] border-l border-[var(--border)] bg-[rgba(9,12,18,0.96)] flex flex-col max-lg:w-[300px] max-md:absolute max-md:right-0 max-md:top-0 max-md:bottom-0 max-md:z-20 max-md:shadow-[-12px_0_40px_rgba(0,0,0,0.35)]",
		children: [/* @__PURE__ */ jsxs("div", {
			className: "px-4 py-3.5 border-b border-[var(--border)] flex items-center justify-between gap-3",
			children: [/* @__PURE__ */ jsxs("div", {
				className: "min-w-0",
				children: [/* @__PURE__ */ jsx("div", {
					className: "text-sm font-semibold text-[#eef2ff] truncate",
					children: "Thông tin hội thoại"
				}), /* @__PURE__ */ jsx("div", {
					className: "text-xs text-muted-foreground truncate",
					children: isGroup ? "Nhóm Zalo" : "Người dùng Zalo"
				})]
			}), /* @__PURE__ */ jsx(Button, {
				type: "button",
				variant: "ghost",
				size: "sm",
				onClick: onClose,
				className: "h-8 px-2 text-xs",
				children: "Đóng"
			})]
		}), /* @__PURE__ */ jsxs("div", {
			className: "flex-1 overflow-y-auto px-4 py-5 space-y-5",
			children: [
				/* @__PURE__ */ jsxs("div", {
					className: "flex flex-col items-center text-center gap-3",
					children: [/* @__PURE__ */ jsxs(Avatar$1, {
						className: "w-20 h-20 rounded-3xl",
						children: [avatar ? /* @__PURE__ */ jsx("img", {
							src: avatar,
							alt: title,
							className: "w-full h-full object-cover rounded-3xl"
						}) : null, /* @__PURE__ */ jsx(AvatarFallback, {
							className: "bg-gradient-to-br from-[#4f7aff] to-[#5fd4ff] text-[#08101d] text-2xl font-extrabold rounded-3xl",
							children: getInitial(title)
						})]
					}), /* @__PURE__ */ jsxs("div", { children: [/* @__PURE__ */ jsx("div", {
						className: "text-lg font-bold text-[#f3f6ff] break-words",
						children: title
					}), /* @__PURE__ */ jsx("div", {
						className: "text-xs text-muted-foreground mt-1",
						children: conversation.id
					})] })]
				}),
				/* @__PURE__ */ jsx(Separator$1, {}),
				/* @__PURE__ */ jsxs("div", {
					className: "space-y-4",
					children: [
						/* @__PURE__ */ jsx(DetailRow, {
							label: "Loại hội thoại",
							value: isGroup ? "Nhóm" : "1-1"
						}),
						/* @__PURE__ */ jsx(DetailRow, {
							label: "Thread ID",
							value: conversation.threadId
						}),
						/* @__PURE__ */ jsx(DetailRow, {
							label: "Tin nhắn gần nhất",
							value: conversation.lastMessageText
						}),
						/* @__PURE__ */ jsx(DetailRow, {
							label: "Số tin nhắn local",
							value: conversation.messageCount
						})
					]
				}),
				contact && /* @__PURE__ */ jsxs(Fragment, { children: [/* @__PURE__ */ jsx(Separator$1, {}), /* @__PURE__ */ jsxs("div", {
					className: "space-y-4",
					children: [
						/* @__PURE__ */ jsx("div", {
							className: "text-sm font-semibold text-[#eef2ff]",
							children: "Thông tin người dùng"
						}),
						/* @__PURE__ */ jsx(DetailRow, {
							label: "Tên hiển thị",
							value: getContactDisplayName(contact)
						}),
						/* @__PURE__ */ jsx(DetailRow, {
							label: "Hub alias",
							value: contact.hubAlias
						}),
						/* @__PURE__ */ jsx(DetailRow, {
							label: "Zalo alias",
							value: contact.zaloAlias
						}),
						/* @__PURE__ */ jsx(DetailRow, {
							label: "Tên Zalo",
							value: contact.zaloName
						}),
						/* @__PURE__ */ jsx(DetailRow, {
							label: "Số điện thoại",
							value: contact.phoneNumber
						}),
						/* @__PURE__ */ jsx(DetailRow, {
							label: "User ID",
							value: contact.userId
						})
					]
				})] }),
				group && /* @__PURE__ */ jsxs(Fragment, { children: [/* @__PURE__ */ jsx(Separator$1, {}), /* @__PURE__ */ jsxs("div", {
					className: "space-y-4",
					children: [
						/* @__PURE__ */ jsx("div", {
							className: "text-sm font-semibold text-[#eef2ff]",
							children: "Thông tin nhóm"
						}),
						/* @__PURE__ */ jsx(DetailRow, {
							label: "Tên nhóm",
							value: group.displayName
						}),
						/* @__PURE__ */ jsx(DetailRow, {
							label: "Group ID",
							value: group.groupId
						}),
						/* @__PURE__ */ jsx(DetailRow, {
							label: "Số thành viên",
							value: group.memberCount
						})
					]
				})] }),
				/* @__PURE__ */ jsx(Separator$1, {}),
				/* @__PURE__ */ jsxs("div", {
					className: "space-y-4",
					children: [
						/* @__PURE__ */ jsx("div", {
							className: "text-sm font-semibold text-[#eef2ff]",
							children: "Workspace hiện tại"
						}),
						/* @__PURE__ */ jsx(DetailRow, {
							label: "Tài khoản xử lý",
							value: workspaceAccount ? getAccountDisplayName(workspaceAccount) : void 0
						}),
						/* @__PURE__ */ jsx(DetailRow, {
							label: "Số điện thoại account",
							value: workspaceAccount?.phoneNumber
						}),
						/* @__PURE__ */ jsx(DetailRow, {
							label: "Account ID",
							value: workspaceAccount?.accountId
						})
					]
				}),
				/* @__PURE__ */ jsx(Separator$1, {}),
				/* @__PURE__ */ jsxs("div", {
					className: "space-y-3",
					children: [
						/* @__PURE__ */ jsx("div", {
							className: "text-sm font-semibold text-[#eef2ff]",
							children: "Thao tác"
						}),
						/* @__PURE__ */ jsxs("div", {
							className: "grid gap-2",
							children: [
								/* @__PURE__ */ jsx(Button, {
									type: "button",
									variant: "secondary",
									className: "justify-start h-9 text-sm",
									disabled: true,
									children: "Ghim ghi chú người dùng"
								}),
								/* @__PURE__ */ jsx(Button, {
									type: "button",
									variant: "secondary",
									className: "justify-start h-9 text-sm",
									disabled: true,
									children: "Xem lịch sử thao tác"
								}),
								/* @__PURE__ */ jsx(Button, {
									type: "button",
									variant: "secondary",
									className: "justify-start h-9 text-sm",
									disabled: true,
									children: "Gắn nhãn hội thoại"
								})
							]
						}),
						/* @__PURE__ */ jsx("div", {
							className: "text-[11px] text-muted-foreground",
							children: "Phần thao tác sẽ được mở rộng tiếp sau khi hoàn tất các flow chat cơ bản."
						})
					]
				})
			]
		})]
	});
}
//#endregion
//#region src/bff-api.ts
async function bffReq(url, options = {}) {
	const headers = {};
	if (!(options.body instanceof FormData)) headers["Content-Type"] = "application/json";
	const res = await fetch(url, {
		credentials: "include",
		headers,
		...options
	});
	const body = await res.json().catch(() => ({}));
	if (!res.ok) throw new Error(body.message ?? `HTTP ${res.status}`);
	return body.data;
}
async function bffUpload(url, formData) {
	const res = await fetch(url, {
		method: "POST",
		credentials: "include",
		body: formData
	});
	const body = await res.json().catch(() => ({}));
	if (!res.ok) throw new Error(body.message ?? `HTTP ${res.status}`);
	return body.data;
}
var bff = {
	authLogin: (email, password) => bffReq("/bff/auth/login", {
		method: "POST",
		body: JSON.stringify({
			email,
			password
		})
	}),
	authLogout: () => bffReq("/bff/auth/logout", { method: "POST" }),
	authMe: () => bffReq("/bff/auth/me"),
	workspaceInit: () => bffReq("/bff/workspace/init", { method: "POST" }),
	workspaceLoadAccount: (accountId, refresh = false) => bffReq("/bff/workspace/load-account", {
		method: "POST",
		body: JSON.stringify({
			accountId,
			refresh
		})
	}),
	chatOpenConversation: (accountId, conversationId, options = {}) => bffReq("/bff/chat/open-conversation", {
		method: "POST",
		body: JSON.stringify({
			accountId,
			conversationId,
			...options
		})
	}),
	chatGetMessages: (accountId, conversationId, options = {}) => {
		const params = new URLSearchParams();
		if (options.since) params.set("since", options.since);
		if (options.before) params.set("before", options.before);
		if (options.limit) params.set("limit", String(options.limit));
		const suffix = params.size > 0 ? `?${params.toString()}` : "";
		return bffReq(`/bff/chat/conversations/${encodeURIComponent(accountId)}/messages/${encodeURIComponent(conversationId)}${suffix}`);
	},
	chatGetConversations: (accountId) => bffReq(`/bff/chat/conversations/${encodeURIComponent(accountId)}`),
	send: (params, file) => {
		if (file) {
			const fd = new FormData();
			fd.append("accountId", params.accountId);
			fd.append("conversationId", params.conversationId);
			fd.append("type", "attachment");
			fd.append("file", file, file.name);
			if (params.caption) fd.append("caption", params.caption);
			return bffUpload("/bff/chat/send", fd);
		}
		return bffReq("/bff/chat/send", {
			method: "POST",
			body: JSON.stringify(params)
		});
	},
	sendTyping: (accountId, conversationId, isTyping) => bffReq("/bff/chat/typing", {
		method: "POST",
		body: JSON.stringify({
			accountId,
			conversationId,
			isTyping
		})
	}),
	sendReaction: (accountId, conversationId, messageId, cliMsgId, icon) => bffReq("/bff/chat/reaction", {
		method: "POST",
		body: JSON.stringify({
			accountId,
			conversationId,
			messageId,
			cliMsgId,
			icon
		})
	}),
	updateReadState: (accountId, conversationId, readAt) => bffReq("/bff/chat/read-state", {
		method: "POST",
		body: JSON.stringify({
			accountId,
			conversationId,
			readAt
		})
	}),
	forwardMessage: (accountId, conversationId, messageId, toThreadId, toType) => bffReq("/bff/chat/forward", {
		method: "POST",
		body: JSON.stringify({
			accountId,
			conversationId,
			messageId,
			toThreadId,
			toType
		})
	}),
	createPoll: (accountId, groupId, question, options) => bffReq("/bff/chat/poll", {
		method: "POST",
		body: JSON.stringify({
			accountId,
			groupId,
			question,
			options
		})
	}),
	loginStart: () => bffReq("/bff/login/start", { method: "POST" }),
	loginQr: () => bffReq("/bff/login/qr"),
	reconnectStart: (accountId) => bffReq(`/bff/admin/accounts/${encodeURIComponent(accountId)}/reconnect`, { method: "POST" }),
	reconnectQr: (accountId) => bffReq(`/bff/admin/accounts/${encodeURIComponent(accountId)}/reconnect/qr`),
	activateAccount: (accountId) => bffReq("/bff/workspace/account/activate", {
		method: "POST",
		body: JSON.stringify({ accountId })
	}),
	updateAccountProfile: (accountId, updates) => bffReq(`/bff/account/${encodeURIComponent(accountId)}/profile`, {
		method: "PUT",
		body: JSON.stringify(updates)
	}),
	syncHistory: (accountId, conversationId, options = {}) => bffReq("/bff/sync-history", {
		method: "POST",
		body: JSON.stringify({
			accountId,
			conversationId,
			...options
		})
	}),
	mobileSync: (accountId) => bffReq("/bff/mobile-sync", {
		method: "POST",
		body: JSON.stringify({ accountId })
	}),
	mobileSyncThread: (accountId, threadId, threadType, timeoutMs) => bffReq("/bff/mobile-sync-thread", {
		method: "POST",
		body: JSON.stringify({
			accountId,
			threadId,
			threadType,
			timeoutMs
		})
	}),
	syncAll: (accountId) => bffReq("/bff/sync-all", {
		method: "POST",
		body: JSON.stringify({ accountId })
	}),
	restartAccount: (accountId) => bffReq(`/bff/account/${encodeURIComponent(accountId)}/restart`, { method: "POST" }),
	myAccounts: () => bffReq("/bff/workspace/me/accounts"),
	setAccountVisible: (accountId, visible) => bffReq(`/bff/admin/me/accounts/${encodeURIComponent(accountId)}/visible`, {
		method: "PUT",
		body: JSON.stringify({ visible })
	}),
	adminUsers: () => bffReq("/bff/admin/users"),
	adminCreateUser: (email, password, displayName) => bffReq("/bff/admin/users", {
		method: "POST",
		body: JSON.stringify({
			email,
			password,
			displayName
		})
	}),
	adminUpdateUser: (userId, updates) => bffReq(`/bff/admin/users/${encodeURIComponent(userId)}`, {
		method: "PUT",
		body: JSON.stringify(updates)
	}),
	adminDeleteUser: (userId) => bffReq(`/bff/admin/users/${encodeURIComponent(userId)}`, { method: "DELETE" }),
	status: () => bffReq("/bff/status"),
	accounts: () => bffReq("/bff/accounts"),
	accountStatus: (accountId) => bffReq(`/bff/account/${encodeURIComponent(accountId)}/status`),
	accountMobileSync: (accountId) => bff.mobileSync(accountId),
	accountSyncAll: (accountId) => bff.syncAll(accountId),
	adminUpdateMembership: (userId, accountId, role) => bff.adminAddMember(accountId, userId, role),
	adminAllAccounts: () => bffReq("/bff/admin/accounts/all"),
	adminAccountEntities: (accountId) => bffReq(`/bff/admin/accounts/${encodeURIComponent(accountId)}/entities`),
	adminAddMember: (accountId, email, role) => bffReq(`/bff/admin/accounts/${encodeURIComponent(accountId)}/members`, {
		method: "POST",
		body: JSON.stringify({
			email,
			role
		})
	}),
	adminRemoveMember: (accountId, userId) => bffReq(`/bff/admin/accounts/${encodeURIComponent(accountId)}/members/${encodeURIComponent(userId)}`, { method: "DELETE" }),
	adminUpdateMemberRole: (accountId, userId, role) => bffReq(`/bff/admin/accounts/${encodeURIComponent(accountId)}/members/${encodeURIComponent(userId)}`, {
		method: "PUT",
		body: JSON.stringify({ role })
	}),
	adminTransferMaster: (accountId, userId) => bffReq(`/bff/admin/accounts/${encodeURIComponent(accountId)}/transfer`, {
		method: "PUT",
		body: JSON.stringify({ userId })
	}),
	adminDeleteAccount: (accountId) => bffReq(`/bff/admin/accounts/${encodeURIComponent(accountId)}`, { method: "DELETE" }),
	adminLogoutAccount: (accountId) => bffReq(`/bff/admin/accounts/${encodeURIComponent(accountId)}/logout`, { method: "POST" }),
	adminUpdateAccount: (accountId, updates) => bffReq(`/bff/admin/accounts/${encodeURIComponent(accountId)}`, {
		method: "PUT",
		body: JSON.stringify(updates)
	}),
	adminSyncAccountProfile: (accountId) => bffReq(`/bff/admin/accounts/${encodeURIComponent(accountId)}/sync-profile`, { method: "POST" }),
	adminBots: () => bffReq("/bff/admin/bots"),
	adminBotCreate: (data) => bffReq("/bff/admin/bots", {
		method: "POST",
		body: JSON.stringify(data)
	}),
	adminBotUpdate: (id, data) => bffReq(`/bff/admin/bots/${encodeURIComponent(id)}`, {
		method: "PUT",
		body: JSON.stringify(data)
	}),
	adminBotDelete: (id) => bffReq(`/bff/admin/bots/${encodeURIComponent(id)}`, { method: "DELETE" })
};
//#endregion
//#region src/features/realtime/useWebSocket.ts
function useWebSocket(handlers) {
	const ws = useRef(null);
	const reconnectTimer = useRef(null);
	const reconnectAttempts = useRef(0);
	const activeConversationId = useRef("");
	const activeAccountId = useRef("");
	const handlersRef = useRef(handlers);
	handlersRef.current = handlers;
	const getReconnectDelay = useCallback(() => {
		const delays = [
			1e3,
			2e3,
			4e3,
			8e3,
			16e3,
			3e4
		];
		return delays[Math.min(reconnectAttempts.current, delays.length - 1)];
	}, []);
	const connect = useCallback(() => {
		if (ws.current?.readyState === WebSocket.OPEN || ws.current?.readyState === WebSocket.CONNECTING) return;
		const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
		const socket = new WebSocket(`${protocol}//${window.location.host}/bff/ws`);
		ws.current = socket;
		socket.addEventListener("open", () => {
			reconnectAttempts.current = 0;
			if (reconnectTimer.current) clearTimeout(reconnectTimer.current);
			if (activeConversationId.current && activeAccountId.current) socket.send(JSON.stringify({
				type: "subscribe",
				accountId: activeAccountId.current,
				conversationId: activeConversationId.current
			}));
		});
		socket.addEventListener("message", (event) => {
			try {
				const payload = JSON.parse(String(event.data));
				if (payload.type === "session_state") handlersRef.current.onStatus?.({
					accountId: payload.accountId,
					status: payload.status
				});
				if (payload.type === "conversation_summaries") handlersRef.current.onConversations?.({
					accountId: payload.accountId,
					conversations: payload.conversations
				});
				if (payload.type === "conversation_message") handlersRef.current.onMessage?.({
					accountId: payload.accountId,
					message: payload.message
				});
				if (payload.type === "ws_sync_status") handlersRef.current.onSyncStatus?.(payload);
			} catch {}
		});
		socket.addEventListener("close", () => {
			if (ws.current === socket) ws.current = null;
			reconnectAttempts.current += 1;
			reconnectTimer.current = setTimeout(connect, getReconnectDelay());
		});
		socket.addEventListener("error", () => {
			socket.close();
		});
	}, [getReconnectDelay]);
	useEffect(() => {
		connect();
		return () => {
			ws.current?.close();
			if (reconnectTimer.current) clearTimeout(reconnectTimer.current);
		};
	}, [connect]);
	return {
		subscribe: useCallback((accountId, conversationId) => {
			activeAccountId.current = accountId;
			activeConversationId.current = conversationId;
			if (ws.current?.readyState === WebSocket.OPEN) ws.current.send(JSON.stringify({
				type: "subscribe",
				accountId,
				conversationId
			}));
		}, []),
		unsubscribe: useCallback(() => {
			activeAccountId.current = "";
			activeConversationId.current = "";
			if (ws.current?.readyState === WebSocket.OPEN) ws.current.send(JSON.stringify({ type: "unsubscribe" }));
		}, [])
	};
}
//#endregion
//#region src/stores/auth-store.ts
var useAuthStore = create((set) => ({
	user: null,
	isLoading: false,
	isChecking: true,
	login: async (email, password) => {
		set({ isLoading: true });
		try {
			set({
				user: (await bff.authLogin(email, password)).user,
				isLoading: false,
				isChecking: false
			});
			return { ok: true };
		} catch (err) {
			set({
				isLoading: false,
				isChecking: false
			});
			return {
				ok: false,
				error: err instanceof Error ? err.message : "Login failed"
			};
		}
	},
	logout: async () => {
		try {
			await bff.authLogout();
		} catch {}
		set({ user: null });
	},
	checkSession: async () => {
		try {
			set({
				user: (await bff.authMe()).user,
				isChecking: false
			});
		} catch {
			set({
				user: null,
				isChecking: false
			});
		}
	},
	setUser: (user) => set({
		user,
		isChecking: false
	})
}));
//#endregion
//#region src/lib/client-db.ts
var DB_NAME = "zalohub_local_v1";
var DB_VERSION = 1;
var dbPromise = null;
function getDb() {
	if (typeof window === "undefined" || !window.indexedDB) return Promise.reject(/* @__PURE__ */ new Error("IndexedDB not supported in this environment"));
	if (dbPromise) return dbPromise;
	dbPromise = new Promise((resolve, reject) => {
		const request = window.indexedDB.open(DB_NAME, DB_VERSION);
		request.onupgradeneeded = (event) => {
			const db = event.target.result;
			if (!db.objectStoreNames.contains("messages")) {
				const messageStore = db.createObjectStore("messages", { keyPath: "id" });
				messageStore.createIndex("accountId", "accountId", { unique: false });
				messageStore.createIndex("conversationId", "conversationId", { unique: false });
				messageStore.createIndex("account_conversation", ["accountId", "conversationId"], { unique: false });
				messageStore.createIndex("account_conversation_time", [
					"accountId",
					"conversationId",
					"timestamp"
				], { unique: false });
				messageStore.createIndex("timestamp", "timestamp", { unique: false });
			}
			if (!db.objectStoreNames.contains("conversations")) {
				const convStore = db.createObjectStore("conversations", { keyPath: ["accountId", "id"] });
				convStore.createIndex("accountId", "accountId", { unique: false });
				convStore.createIndex("lastMessageTimestamp", "lastMessageTimestamp", { unique: false });
			}
			if (!db.objectStoreNames.contains("contacts")) db.createObjectStore("contacts", { keyPath: ["accountId", "userId"] });
			if (!db.objectStoreNames.contains("groups")) db.createObjectStore("groups", { keyPath: ["accountId", "groupId"] });
		};
		request.onsuccess = (event) => {
			const db = event.target.result;
			resolve(db);
		};
		request.onerror = (event) => {
			dbPromise = null;
			reject(event.target.error);
		};
	});
	return dbPromise;
}
var clientDb = {
	async getMessages(accountId, conversationId, limit = 50, beforeTimestamp) {
		try {
			const db = await getDb();
			return new Promise((resolve) => {
				const index = db.transaction("messages", "readonly").objectStore("messages").index("account_conversation_time");
				let range;
				if (beforeTimestamp) range = IDBKeyRange.bound([
					accountId,
					conversationId,
					""
				], [
					accountId,
					conversationId,
					beforeTimestamp
				], false, true);
				else range = IDBKeyRange.bound([
					accountId,
					conversationId,
					""
				], [
					accountId,
					conversationId,
					"￿"
				], false, false);
				const request = index.openCursor(range, "prev");
				const results = [];
				request.onsuccess = (e) => {
					const cursor = e.target.result;
					if (cursor && results.length < limit) {
						results.push(cursor.value);
						cursor.continue();
					} else {
						results.sort((a, b) => a.timestamp.localeCompare(b.timestamp));
						resolve(results);
					}
				};
				request.onerror = () => resolve([]);
			});
		} catch {
			return [];
		}
	},
	async saveMessages(accountId, conversationId, messages) {
		if (!messages.length) return;
		try {
			const db = await getDb();
			return new Promise((resolve, reject) => {
				const tx = db.transaction("messages", "readwrite");
				const store = tx.objectStore("messages");
				for (const msg of messages) {
					const item = {
						...msg,
						accountId,
						conversationId: msg.conversationId || conversationId
					};
					store.put(item);
				}
				tx.oncomplete = () => resolve();
				tx.onerror = () => reject(tx.error);
			});
		} catch {}
	},
	async getConversations(accountId) {
		try {
			const db = await getDb();
			return new Promise((resolve) => {
				const request = db.transaction("conversations", "readonly").objectStore("conversations").index("accountId").getAll(IDBKeyRange.only(accountId));
				request.onsuccess = () => {
					const list = request.result || [];
					list.sort((a, b) => (b.lastMessageTimestamp || "").localeCompare(a.lastMessageTimestamp || ""));
					resolve(list);
				};
				request.onerror = () => resolve([]);
			});
		} catch {
			return [];
		}
	},
	async saveConversations(accountId, conversations) {
		if (!conversations.length) return;
		try {
			const db = await getDb();
			return new Promise((resolve, reject) => {
				const tx = db.transaction("conversations", "readwrite");
				const store = tx.objectStore("conversations");
				for (const conv of conversations) store.put({
					...conv,
					accountId
				});
				tx.oncomplete = () => resolve();
				tx.onerror = () => reject(tx.error);
			});
		} catch {}
	},
	async getContacts(accountId) {
		try {
			const db = await getDb();
			return new Promise((resolve) => {
				const request = db.transaction("contacts", "readonly").objectStore("contacts").getAll();
				request.onsuccess = () => {
					resolve((request.result || []).filter((c) => c.accountId === accountId));
				};
				request.onerror = () => resolve([]);
			});
		} catch {
			return [];
		}
	},
	async saveContacts(accountId, contacts) {
		if (!contacts.length) return;
		try {
			const db = await getDb();
			return new Promise((resolve, reject) => {
				const tx = db.transaction("contacts", "readwrite");
				const store = tx.objectStore("contacts");
				for (const c of contacts) store.put({
					...c,
					accountId
				});
				tx.oncomplete = () => resolve();
				tx.onerror = () => reject(tx.error);
			});
		} catch {}
	},
	async getGroups(accountId) {
		try {
			const db = await getDb();
			return new Promise((resolve) => {
				const request = db.transaction("groups", "readonly").objectStore("groups").getAll();
				request.onsuccess = () => {
					resolve((request.result || []).filter((g) => g.accountId === accountId));
				};
				request.onerror = () => resolve([]);
			});
		} catch {
			return [];
		}
	},
	async saveGroups(accountId, groups) {
		if (!groups.length) return;
		try {
			const db = await getDb();
			return new Promise((resolve, reject) => {
				const tx = db.transaction("groups", "readwrite");
				const store = tx.objectStore("groups");
				for (const g of groups) store.put({
					...g,
					accountId
				});
				tx.oncomplete = () => resolve();
				tx.onerror = () => reject(tx.error);
			});
		} catch {}
	}
};
//#endregion
//#region src/hooks/useMessageCache.ts
function mergeMessageList(base, incoming) {
	const byKey = /* @__PURE__ */ new Map();
	for (const message of base) byKey.set(message.providerMessageId ?? message.id, message);
	for (const message of incoming) byKey.set(message.providerMessageId ?? message.id, message);
	return [...byKey.values()].sort((a, b) => a.timestamp.localeCompare(b.timestamp));
}
function useMessageCache() {
	const messageCacheRef = useRef(/* @__PURE__ */ new Map());
	function getConversationCacheKey(accountId, conversationId) {
		return `${accountId}::${conversationId}`;
	}
	function setConversationCache(accountId, conversationId, nextMessages) {
		messageCacheRef.current.set(getConversationCacheKey(accountId, conversationId), nextMessages);
	}
	const mergeMessagesIntoConversation = useCallback((accountId, conversationId, incoming, mode = "append") => {
		const previous = messageCacheRef.current.get(getConversationCacheKey(accountId, conversationId)) ?? [];
		const next = mode === "replace" ? mergeMessageList([], incoming) : mergeMessageList(previous, incoming);
		setConversationCache(accountId, conversationId, next);
		if (incoming.length > 0) clientDb.saveMessages(accountId, conversationId, incoming);
		return {
			next,
			previous
		};
	}, []);
	const prependMessages = useCallback((accountId, conversationId, incoming) => {
		return mergeMessagesIntoConversation(accountId, conversationId, incoming, "append");
	}, [mergeMessagesIntoConversation]);
	const getCachedMessages = useCallback((accountId, conversationId) => {
		return messageCacheRef.current.get(getConversationCacheKey(accountId, conversationId)) ?? [];
	}, []);
	const loadFromDb = useCallback(async (accountId, conversationId, limit = 50, before) => {
		const dbMessages = await clientDb.getMessages(accountId, conversationId, limit, before);
		if (dbMessages.length > 0) {
			const merged = mergeMessageList(messageCacheRef.current.get(getConversationCacheKey(accountId, conversationId)) ?? [], dbMessages);
			setConversationCache(accountId, conversationId, merged);
			return merged;
		}
		return dbMessages;
	}, []);
	function clearCache() {
		messageCacheRef.current.clear();
	}
	return {
		messageCacheRef,
		getConversationCacheKey,
		setConversationCache,
		mergeMessagesIntoConversation,
		prependMessages,
		getCachedMessages,
		loadFromDb,
		clearCache
	};
}
//#endregion
//#region src/hooks/useAccountManager.ts
function toAccountSummary(account) {
	return {
		accountId: account.accountId,
		hubAlias: account.hubAlias,
		displayName: account.account?.displayName ?? account.displayName,
		phoneNumber: account.account?.phoneNumber ?? account.phoneNumber,
		avatar: account.account?.avatar ?? account.avatar,
		isActive: account.isActive,
		hasCredential: account.hasCredential,
		runtimeLoaded: account.runtimeLoaded,
		sessionActive: account.sessionActive
	};
}
function useAccountManager() {
	return {
		loadData: useCallback(async (accountId, status, options = {}, setContacts, setGroups, replaceAccountConversations, setLoadError) => {
			if (!accountId) return;
			if (!status?.sessionActive) return;
			try {
				const refresh = Boolean(options.refresh);
				const result = await bff.workspaceLoadAccount(accountId, refresh);
				if (result.contacts) setContacts(result.contacts.contacts);
				if (result.groups) setGroups(result.groups.groups);
				if (result.conversations) replaceAccountConversations(accountId, result.conversations.conversations);
				setLoadError("");
			} catch (error) {
				setLoadError(error instanceof Error ? error.message : "Khong tai duoc du lieu");
			}
		}, []),
		handleLogout: useCallback(async (setStatus, resetAll, clearComposer, clearCache, setLoadError, setStatusMsg, unsubscribe, setKnownAccounts, setSelectedAccountId, activeConversationIdRef, selectionTokenRef) => {
			await bff.authLogout().catch(() => {});
			setStatus(null);
			resetAll();
			clearComposer();
			activeConversationIdRef.current = "";
			selectionTokenRef.current += 1;
			clearCache();
			setLoadError("");
			unsubscribe();
			setStatusMsg("Da dang xuat.");
			bff.workspaceInit().then((result) => {
				if (result.status) setStatus(result.status);
				if (result.accounts) {
					setKnownAccounts(result.accounts.accounts.map(toAccountSummary));
					setSelectedAccountId(result.accounts.activeAccountId ?? "");
				}
			}).catch(() => {});
		}, []),
		handleSelectAccount: useCallback(async (accountId, setSelectedAccountId, setStatus, setStatusMsg, setLoadError, setActiveConversationId, setMessages, clearActivePane, clearComposer, clearCache, unsubscribe, setKnownAccounts, loadData, activeConversationIdRef, selectionTokenRef) => {
			setSelectedAccountId(accountId);
			setStatusMsg("Dang chuyen tai khoan...");
			setLoadError("");
			selectionTokenRef.current += 1;
			activeConversationIdRef.current = "";
			setActiveConversationId("");
			setMessages([]);
			clearComposer();
			clearActivePane();
			clearCache();
			unsubscribe();
			try {
				const result = await bff.activateAccount(accountId);
				setStatus(result.status);
				const accountsResult = await bff.workspaceInit();
				if (accountsResult.accounts) {
					setKnownAccounts(accountsResult.accounts.accounts.map(toAccountSummary));
					setSelectedAccountId(accountsResult.accounts.activeAccountId ?? accountId);
				}
				if (result.status?.sessionActive) {
					await loadData(accountId, result.status, { refresh: true });
					setStatusMsg("Da chuyen tai khoan.");
				} else setStatusMsg("Tai khoan chua active. Nhan de dang nhap lai bang QR.");
			} catch (error) {
				setLoadError(error instanceof Error ? error.message : "Khong chuyen duoc tai khoan");
				setStatusMsg("");
				bff.workspaceInit().then((r) => {
					if (r.status) setStatus(r.status);
					if (r.accounts) {
						setKnownAccounts(r.accounts.accounts.map(toAccountSummary));
						setSelectedAccountId(r.accounts.activeAccountId ?? accountId);
					}
				}).catch(() => {});
			}
		}, [])
	};
}
//#endregion
//#region src/hooks/useConversationManager.ts
function useConversationManager() {
	const refreshConversationMessages = useCallback(async (accountId, conversationId, mergeMessagesIntoConversation, setHasMoreHistory, selectionTokenRef, activeConversationIdRef, messagesEndRef) => {
		const token = selectionTokenRef.current;
		try {
			const r = await bff.chatGetMessages(accountId, conversationId, { limit: 40 });
			const stillActive = activeConversationIdRef.current === conversationId && token === selectionTokenRef.current;
			if (r.messages && r.messages.length > 0) {
				mergeMessagesIntoConversation(accountId, conversationId, r.messages, "replace");
				if (stillActive) {
					setHasMoreHistory(Boolean(r.hasMore));
					requestAnimationFrame(() => messagesEndRef.current?.scrollIntoView({ behavior: "smooth" }));
				}
			}
			return r;
		} catch {
			return {
				messages: [],
				count: 0,
				hasMore: false
			};
		}
	}, []);
	const syncConversationHistory = useCallback(async (accountId, conversationId, beforeMessageId, readAt, refreshConversationMessages, setSyncingHistory, setStatusMsg, setHasMoreHistory, replaceAccountConversations, selectionTokenRef, activeConversationIdRef) => {
		const token = selectionTokenRef.current;
		if (activeConversationIdRef.current === conversationId) setSyncingHistory(true);
		try {
			const result = await bff.syncHistory(accountId, conversationId, {
				beforeMessageId,
				timeoutMs: 8e3
			});
			if (readAt) bff.updateReadState(accountId, conversationId, readAt).catch(() => {});
			await refreshConversationMessages(accountId, conversationId);
			const cv = await bff.chatGetConversations(accountId).catch(() => ({ conversations: [] }));
			if (token === selectionTokenRef.current && cv.conversations?.length > 0) {
				replaceAccountConversations(accountId, cv.conversations);
				clientDb.saveConversations(accountId, cv.conversations);
			}
			if (activeConversationIdRef.current === conversationId && token === selectionTokenRef.current) setHasMoreHistory(result.hasMore || result.insertedCount > 0);
			return result;
		} catch (err) {
			return {
				conversationId,
				threadId: "",
				type: "direct",
				remoteCount: 0,
				insertedCount: 0,
				dedupedCount: 0,
				hasMore: false
			};
		} finally {
			if (activeConversationIdRef.current === conversationId && token === selectionTokenRef.current) setSyncingHistory(false);
		}
	}, []);
	return {
		selectConversation: useCallback(async (conversationId, accountId, subscribe, getCachedMessages, mergeMessagesIntoConversation, setMessages, setActiveConversationId, setHasMoreHistory, setLoadError, setStatusMsg, loadData, refreshConversationMessages, syncConversationHistory, selectionTokenRef, activeConversationIdRef, loadFromDb) => {
			const token = selectionTokenRef.current + 1;
			selectionTokenRef.current = token;
			setActiveConversationId(conversationId);
			activeConversationIdRef.current = conversationId;
			setLoadError("");
			setStatusMsg("");
			subscribe(accountId, conversationId);
			if (typeof localStorage !== "undefined") localStorage.setItem("zalohub_active_conversation", conversationId);
			let cached = getCachedMessages(accountId, conversationId);
			if (cached.length > 0) {
				setMessages(cached);
				setHasMoreHistory(true);
			} else if (loadFromDb) {
				const dbMsgs = await loadFromDb(accountId, conversationId, 50);
				if (token === selectionTokenRef.current && activeConversationIdRef.current === conversationId) {
					if (dbMsgs.length > 0) {
						cached = dbMsgs;
						setMessages(dbMsgs);
						setHasMoreHistory(true);
					}
				}
			}
			(async () => {
				try {
					const latestTime = cached.length > 0 ? cached[cached.length - 1]?.timestamp : void 0;
					const messagesRes = await bff.chatGetMessages(accountId, conversationId, {
						since: latestTime,
						limit: 50
					}).catch(() => null);
					if (token !== selectionTokenRef.current || activeConversationIdRef.current !== conversationId) return;
					if (messagesRes && messagesRes.messages) {
						if (messagesRes.messages.length > 0) {
							const { next } = mergeMessagesIntoConversation(accountId, conversationId, messagesRes.messages, cached.length > 0 ? "append" : "replace");
							setMessages(next);
							setHasMoreHistory(Boolean(messagesRes.hasMore || next.length >= 40));
						} else if (cached.length === 0) {
							const initialRes = await refreshConversationMessages(accountId, conversationId);
							if (token === selectionTokenRef.current && activeConversationIdRef.current === conversationId && initialRes) {
								setMessages(initialRes.messages || []);
								setHasMoreHistory(Boolean(initialRes.hasMore));
							}
						}
					}
				} catch (error) {}
			})();
		}, []),
		loadOlderMessages: useCallback(async (accountId, activeConversationId, messages, hasMoreHistory, loadingOlder, setLoadingOlder, setHasMoreHistory, setLoadError, prependMessages, syncConversationHistory, messagesAreaRef) => {
			if (!activeConversationId || loadingOlder || !hasMoreHistory || messages.length === 0) return;
			if (!accountId) return;
			const oldest = messages[0]?.timestamp;
			if (!oldest) return;
			const container = messagesAreaRef.current;
			const previousHeight = container?.scrollHeight ?? 0;
			setLoadingOlder(true);
			try {
				const dbOlder = await clientDb.getMessages(accountId, activeConversationId, 40, oldest);
				if (dbOlder.length > 0) {
					prependMessages(accountId, activeConversationId, dbOlder);
					setHasMoreHistory(true);
					requestAnimationFrame(() => {
						if (!container) return;
						container.scrollTop = container.scrollHeight - previousHeight;
					});
					return;
				}
				const r = await bff.chatGetMessages(accountId, activeConversationId, {
					before: oldest,
					limit: 40
				});
				if (r.messages.length > 0) {
					prependMessages(accountId, activeConversationId, r.messages);
					setHasMoreHistory(Boolean(r.messages.length >= 40));
				} else setHasMoreHistory(false);
				requestAnimationFrame(() => {
					if (!container) return;
					container.scrollTop = container.scrollHeight - previousHeight;
				});
			} catch (error) {
				setLoadError(error instanceof Error ? error.message : "Khong tai duoc lich su cu hon");
			} finally {
				setLoadingOlder(false);
			}
		}, []),
		refreshConversationMessages,
		syncConversationHistory
	};
}
//#endregion
//#region src/hooks/useComposer.ts
function useComposer() {
	return {
		handleSend: useCallback(async (e, activeConversationId, text, attachFile, accountId, setText, setAttachFile, setSending, setStatusMsg, setLoadError, replaceAccountConversations, setMessages, mergeMessagesIntoConversation, fileInputRef, appendLocalMessage, updateConversationSummaryLocal) => {
			e.preventDefault();
			const trimmedText = text.trim();
			if (!activeConversationId || !trimmedText && !attachFile) return;
			if (!accountId) {
				setStatusMsg("Chua co tai khoan workspace duoc chon");
				return;
			}
			const tempId = `pending-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
			const now = (/* @__PURE__ */ new Date()).toISOString();
			const kind = attachFile ? attachFile.type.startsWith("image/") ? "image" : "file" : "text";
			const pendingMsg = {
				id: tempId,
				conversationId: activeConversationId,
				threadId: "",
				conversationType: "direct",
				text: trimmedText || (attachFile ? `[${kind}]` : ""),
				kind,
				attachments: [],
				direction: "outgoing",
				isSelf: true,
				timestamp: now,
				providerMessageId: tempId,
				cliMsgId: void 0
			};
			appendLocalMessage?.(pendingMsg);
			setText("");
			setAttachFile(null);
			if (fileInputRef.current) fileInputRef.current.value = "";
			setSending(true);
			setStatusMsg("");
			updateConversationSummaryLocal?.(accountId, {
				conversationId: activeConversationId,
				text: pendingMsg.text,
				kind: pendingMsg.kind,
				timestamp: now,
				direction: "outgoing"
			});
			try {
				const params = {
					accountId,
					conversationId: activeConversationId
				};
				if (attachFile) {
					params.type = "attachment";
					if (trimmedText) params.caption = trimmedText;
					const result = await bff.send(params, attachFile);
					const resId = result?.message?.msgId ?? result?.msgId;
					if (resId) {
						pendingMsg.id = String(resId);
						pendingMsg.providerMessageId = String(resId);
					}
				} else {
					params.text = trimmedText;
					const result = await bff.send(params);
					const resId = result?.message?.msgId ?? result?.msgId;
					if (resId) {
						pendingMsg.id = String(resId);
						pendingMsg.providerMessageId = String(resId);
					}
				}
				setLoadError("");
			} catch (err) {
				setStatusMsg(err instanceof Error ? err.message : "Gui that bai");
				setLoadError(err instanceof Error ? err.message : "Gui that bai");
			} finally {
				setSending(false);
			}
		}, []),
		handleKeyDown: useCallback((e, handleSend) => {
			if (e.key === "Enter" && !e.ctrlKey && !e.metaKey) {
				e.preventDefault();
				handleSend(e);
			}
		}, [])
	};
}
//#endregion
//#region src/stores/workspace-store.ts
var LS_KEY = "zalohub_selected_account";
function loadSelectedAccountId() {
	try {
		return localStorage.getItem(LS_KEY) || "";
	} catch {
		return "";
	}
}
function saveSelectedAccountId(id) {
	try {
		if (id) localStorage.setItem(LS_KEY, id);
		else localStorage.removeItem(LS_KEY);
	} catch {}
}
var useWorkspaceStore = create((set) => ({
	selectedAccountId: loadSelectedAccountId(),
	knownAccounts: [],
	sidebarTab: "conversations",
	query: "",
	setSelectedAccountId: (id) => {
		saveSelectedAccountId(id);
		set({ selectedAccountId: id });
	},
	setKnownAccounts: (accounts) => set({ knownAccounts: accounts }),
	addOrUpdateAccount: (account) => set((state) => {
		const idx = state.knownAccounts.findIndex((a) => a.accountId === account.accountId);
		if (idx >= 0) {
			const next = [...state.knownAccounts];
			next[idx] = {
				...next[idx],
				...account
			};
			return { knownAccounts: next };
		}
		return { knownAccounts: [...state.knownAccounts, account] };
	}),
	setSidebarTab: (tab) => set({ sidebarTab: tab }),
	setQuery: (q) => set({ query: q }),
	resetWorkspace: () => {
		saveSelectedAccountId("");
		set({
			selectedAccountId: "",
			sidebarTab: "conversations",
			query: ""
		});
	}
}));
//#endregion
//#region src/stores/chat-store.ts
var useChatStore = create((set, get) => ({
	conversationsByAccount: {},
	pendingReadAtByConversation: {},
	contacts: [],
	groups: [],
	activeConversationId: "",
	messages: [],
	hasMoreHistory: false,
	loadingOlder: false,
	syncingHistory: false,
	replaceAccountConversations: (accountId, c) => set((state) => {
		const nextPending = { ...state.pendingReadAtByConversation };
		const merged = c.map((entry) => {
			const pendingKey = `${accountId}::${entry.id}`;
			const pendingReadAt = nextPending[pendingKey];
			const backendReadAt = entry.lastReadAt ?? (/* @__PURE__ */ new Date(0)).toISOString();
			if (!pendingReadAt) return {
				...entry,
				lastReadAt: backendReadAt
			};
			if (Date.parse(backendReadAt) >= Date.parse(pendingReadAt)) {
				delete nextPending[pendingKey];
				return {
					...entry,
					lastReadAt: backendReadAt
				};
			}
			return {
				...entry,
				unreadCount: 0,
				lastReadAt: pendingReadAt
			};
		});
		return {
			pendingReadAtByConversation: nextPending,
			conversationsByAccount: {
				...state.conversationsByAccount,
				[accountId]: merged
			}
		};
	}),
	setSidebarConversationsForAccount: (accountId, c) => get().replaceAccountConversations(accountId, c),
	markConversationReadLocal: (accountId, conversationId, readAt) => {
		const resolvedReadAt = readAt ?? (/* @__PURE__ */ new Date()).toISOString();
		const key = `${accountId}::${conversationId}`;
		set((state) => ({
			pendingReadAtByConversation: {
				...state.pendingReadAtByConversation,
				[key]: resolvedReadAt
			},
			conversationsByAccount: {
				...state.conversationsByAccount,
				[accountId]: (state.conversationsByAccount[accountId] ?? []).map((entry) => entry.id === conversationId ? {
					...entry,
					unreadCount: 0,
					lastReadAt: resolvedReadAt
				} : entry)
			}
		}));
	},
	clearPendingReadAt: (accountId, conversationId, persistedReadAt) => set((state) => {
		const key = `${accountId}::${conversationId}`;
		const pendingReadAt = state.pendingReadAtByConversation[key];
		if (!pendingReadAt) return state;
		if (persistedReadAt && Date.parse(persistedReadAt) < Date.parse(pendingReadAt)) return state;
		const nextPending = { ...state.pendingReadAtByConversation };
		delete nextPending[key];
		return { pendingReadAtByConversation: nextPending };
	}),
	prependConversation: (entry) => set((state) => {
		const accountEntries = state.conversationsByAccount[entry.accountId] ?? [];
		if (accountEntries.find((e) => e.id === entry.id)) return state;
		return { conversationsByAccount: {
			...state.conversationsByAccount,
			[entry.accountId]: [entry, ...accountEntries]
		} };
	}),
	updateConversationFromWs: (accountId, msg) => set((state) => {
		const current = state.conversationsByAccount[accountId] ?? [];
		const idx = current.findIndex((e) => e.id === msg.conversationId);
		if (idx < 0) return state;
		const next = [...current];
		next[idx] = {
			...next[idx],
			lastMessageText: msg.text,
			lastMessageKind: msg.kind,
			lastMessageTimestamp: msg.timestamp,
			lastDirection: msg.direction
		};
		next.sort((a, b) => b.lastMessageTimestamp.localeCompare(a.lastMessageTimestamp));
		return { conversationsByAccount: {
			...state.conversationsByAccount,
			[accountId]: next
		} };
	}),
	updateConversationSummaryLocal: (accountId, msg) => set((state) => {
		const current = state.conversationsByAccount[accountId] ?? [];
		const idx = current.findIndex((e) => e.id === msg.conversationId);
		const next = [...current];
		if (idx >= 0) next[idx] = {
			...next[idx],
			lastMessageText: msg.text,
			lastMessageKind: msg.kind,
			lastMessageTimestamp: msg.timestamp,
			lastDirection: msg.direction,
			messageCount: next[idx].messageCount + 1
		};
		next.sort((a, b) => b.lastMessageTimestamp.localeCompare(a.lastMessageTimestamp));
		return { conversationsByAccount: {
			...state.conversationsByAccount,
			[accountId]: next
		} };
	}),
	appendLocalMessage: (msg) => set((state) => ({ messages: [...state.messages, msg] })),
	reconcileOutgoingMessage: (sentMsg) => set((state) => {
		return { messages: state.messages.map((m) => {
			if (m.id.startsWith("pending-") && m.conversationId === sentMsg.conversationId && m.direction === "outgoing" && m.text === sentMsg.text) return sentMsg;
			return m;
		}) };
	}),
	getAccountConversations: (accountId) => get().conversationsByAccount[accountId] ?? [],
	setContacts: (c) => set({ contacts: c }),
	setGroups: (g) => set({ groups: g }),
	setActiveConversationId: (id) => set({ activeConversationId: id }),
	setMessages: (m) => set({ messages: m }),
	setHasMoreHistory: (v) => set({ hasMoreHistory: v }),
	setLoadingOlder: (v) => set({ loadingOlder: v }),
	setSyncingHistory: (v) => set({ syncingHistory: v }),
	clearActivePane: () => set({
		pendingReadAtByConversation: {},
		contacts: [],
		groups: [],
		activeConversationId: "",
		messages: [],
		hasMoreHistory: false,
		loadingOlder: false,
		syncingHistory: false
	}),
	resetAll: () => set({
		conversationsByAccount: {},
		pendingReadAtByConversation: {},
		contacts: [],
		groups: [],
		activeConversationId: "",
		messages: [],
		hasMoreHistory: false,
		loadingOlder: false,
		syncingHistory: false
	})
}));
//#endregion
//#region src/stores/composer-store.ts
var useComposerStore = create((set) => ({
	text: "",
	attachFile: null,
	sending: false,
	statusMsg: "",
	loadError: "",
	setText: (t) => set({ text: t }),
	setAttachFile: (f) => set({ attachFile: f }),
	setSending: (v) => set({ sending: v }),
	setStatusMsg: (m) => set({ statusMsg: m }),
	setLoadError: (e) => set({ loadError: e }),
	clearComposer: () => set({
		text: "",
		attachFile: null
	}),
	clearErrors: () => set({
		statusMsg: "",
		loadError: ""
	})
}));
//#endregion
//#region src/features/chat/useDashboardState.ts
function useDashboardState() {
	const navigate = useNavigate();
	const [status, setStatus] = useState(null);
	const [detailsOpen, setDetailsOpen] = useState(false);
	const fileInputRef = useRef(null);
	const messagesEndRef = useRef(null);
	const activeConversationIdRef = useRef("");
	const selectionTokenRef = useRef(0);
	const loadedAccountRef = useRef("");
	const initialBootstrapDoneRef = useRef(false);
	const workspace = useWorkspaceStore();
	const chat = useChatStore();
	const composer = useComposerStore();
	const { user } = useAuthStore();
	const [myAccountsMap, setMyAccountsMap] = useState(/* @__PURE__ */ new Map());
	useEffect(() => {
		activeConversationIdRef.current = chat.activeConversationId;
	}, [chat.activeConversationId]);
	const messageCache = useMessageCache();
	const { loadData, handleSelectAccount } = useAccountManager();
	const { selectConversation, loadOlderMessages, refreshConversationMessages, syncConversationHistory } = useConversationManager();
	const { handleSend, handleKeyDown } = useComposer();
	const resolveWorkspaceId = useCallback(() => {
		return workspace.selectedAccountId || status?.account?.userId || "";
	}, [workspace.selectedAccountId, status]);
	const mapAccountStatusToSummary = useCallback((account) => ({
		accountId: account.accountId,
		hubAlias: account.hubAlias,
		displayName: account.account?.displayName ?? account.displayName,
		phoneNumber: account.account?.phoneNumber ?? account.phoneNumber,
		avatar: account.account?.avatar ?? account.avatar,
		isActive: account.isActive,
		hasCredential: account.hasCredential,
		runtimeLoaded: account.runtimeLoaded,
		sessionActive: account.sessionActive
	}), []);
	const resolveConversationSummaries = useCallback((conversations) => {
		return conversations.map((conversation) => {
			if (conversation.type === "group") {
				const group = chat.groups.find((entry) => groupConversationId(entry.groupId) === conversation.id);
				return {
					...conversation,
					title: group?.displayName ?? conversation.title,
					avatar: group?.avatar ?? conversation.avatar
				};
			}
			const contact = chat.contacts.find((entry) => directConversationId(entry.userId) === conversation.id);
			return {
				...conversation,
				title: contact ? getContactDisplayName(contact) : conversation.title,
				avatar: contact?.avatar ?? conversation.avatar
			};
		});
	}, [chat.contacts, chat.groups]);
	const clearComposer = useCallback(() => {
		composer.clearComposer();
		if (fileInputRef.current) fileInputRef.current.value = "";
	}, [composer]);
	const { subscribe, unsubscribe } = useWebSocket({
		onStatus: ({ accountId, status: nextStatus }) => {
			if (!accountId || accountId === resolveWorkspaceId()) setStatus(nextStatus);
		},
		onConversations: ({ accountId, conversations: nextConversations }) => {
			if (!accountId) return;
			chat.replaceAccountConversations(accountId, nextConversations);
		},
		onMessage: ({ accountId, message }) => {
			if (accountId !== resolveWorkspaceId()) return;
			chat.updateConversationFromWs(accountId, message);
			const { next } = messageCache.mergeMessagesIntoConversation(accountId, message.conversationId, [message], "append");
			if (activeConversationIdRef.current === message.conversationId) {
				if (message.isSelf && message.direction === "outgoing") chat.reconcileOutgoingMessage(message);
				chat.setMessages(next);
			}
		},
		onSyncStatus: ({ accountId, status: syncStatus, requ18Received, historySynced, historyMsgs }) => {
			if (accountId !== resolveWorkspaceId()) return;
			if (syncStatus === "loading") composer.setStatusMsg("Dang tu dong dong bo contacts & groups...");
			else if (syncStatus === "syncing") composer.setStatusMsg("Dang tu dong dong bo lich su chat...");
			else if (syncStatus === "done") {
				composer.setStatusMsg(`Tu dong dong bo xong: ${requ18Received ?? 0} tin req_18 + ${historySynced ?? 0} cuoc tro chuyen (${historyMsgs ?? 0} tin)`);
				loadData(accountId, status, { refresh: true }, chat.setContacts, chat.setGroups, chat.replaceAccountConversations, composer.setLoadError);
			} else if (syncStatus === "error") composer.setLoadError("Tu dong dong bo that bai");
		}
	});
	useEffect(() => {
		if (initialBootstrapDoneRef.current) return;
		initialBootstrapDoneRef.current = true;
		bff.workspaceInit().then((result) => {
			if (result.status) setStatus(result.status);
			if (result.accounts) {
				workspace.setKnownAccounts(result.accounts.accounts.map(mapAccountStatusToSummary));
				if (result.accounts.activeAccountId) workspace.setSelectedAccountId(result.accounts.activeAccountId);
			}
			if (result.myAccounts) {
				const map = /* @__PURE__ */ new Map();
				result.myAccounts.accounts.forEach((a) => map.set(a.accountId, a.visible));
				setMyAccountsMap(map);
			}
		}).catch(() => {});
	}, [mapAccountStatusToSummary, workspace]);
	useEffect(() => {
		const userId = status?.account?.userId?.trim();
		const displayName = status?.account?.displayName?.trim();
		if (!userId) return;
		workspace.addOrUpdateAccount({
			accountId: userId,
			displayName: displayName || userId,
			phoneNumber: status?.account?.phoneNumber,
			avatar: status?.account?.avatar,
			isActive: true
		});
		if (!workspace.selectedAccountId) workspace.setSelectedAccountId(userId);
	}, [
		status?.account?.displayName,
		status?.account?.phoneNumber,
		status?.account?.userId
	]);
	useEffect(() => {
		const accountId = resolveWorkspaceId();
		if (!status?.sessionActive || !accountId || accountId === loadedAccountRef.current) return;
		loadedAccountRef.current = accountId;
		chat.clearActivePane();
		loadData(accountId, status, {}, chat.setContacts, chat.setGroups, chat.replaceAccountConversations, composer.setLoadError);
	}, [workspace.selectedAccountId, status?.sessionActive]);
	const onSelectAccount = useCallback((accountId) => {
		loadedAccountRef.current = "";
		const innerLoad = (aid, s, opts) => loadData(aid, s, opts, chat.setContacts, chat.setGroups, chat.replaceAccountConversations, composer.setLoadError);
		handleSelectAccount(accountId, workspace.setSelectedAccountId, setStatus, composer.setStatusMsg, composer.setLoadError, chat.setActiveConversationId, chat.setMessages, chat.clearActivePane, clearComposer, messageCache.clearCache, unsubscribe, workspace.setKnownAccounts, innerLoad, activeConversationIdRef, selectionTokenRef);
	}, [
		handleSelectAccount,
		loadData,
		clearComposer,
		messageCache,
		unsubscribe,
		chat,
		workspace,
		composer
	]);
	const onSelectConversation = useCallback((conversationId) => {
		const accountId = resolveWorkspaceId();
		if (!accountId) {
			composer.setLoadError("Chua co tai khoan workspace duoc chon");
			return;
		}
		const readAt = (/* @__PURE__ */ new Date()).toISOString();
		chat.markConversationReadLocal(accountId, conversationId, readAt);
		bff.updateReadState(accountId, conversationId, readAt).then((result) => {
			if (result?.ok) chat.clearPendingReadAt(accountId, conversationId, result.readAt);
		}).catch((error) => {
			composer.setLoadError(error instanceof Error ? error.message : "Luu trang thai da doc that bai");
		});
		selectConversation(conversationId, accountId, subscribe, messageCache.getCachedMessages, messageCache.mergeMessagesIntoConversation, chat.setMessages, chat.setActiveConversationId, chat.setHasMoreHistory, composer.setLoadError, composer.setStatusMsg, (aid, s, opts) => loadData(aid, s, opts, chat.setContacts, chat.setGroups, chat.replaceAccountConversations, composer.setLoadError), (aid, cid) => refreshConversationMessages(aid, cid, messageCache.mergeMessagesIntoConversation, chat.setHasMoreHistory, selectionTokenRef, activeConversationIdRef, messagesEndRef), (aid, cid, bmid, readAt) => syncConversationHistory(aid, cid, bmid, readAt, (a, c) => refreshConversationMessages(a, c, messageCache.mergeMessagesIntoConversation, chat.setHasMoreHistory, selectionTokenRef, activeConversationIdRef, messagesEndRef), chat.setSyncingHistory, composer.setStatusMsg, chat.setHasMoreHistory, chat.replaceAccountConversations, selectionTokenRef, activeConversationIdRef), selectionTokenRef, activeConversationIdRef, messageCache.loadFromDb);
	}, [
		resolveWorkspaceId,
		selectConversation,
		subscribe,
		messageCache,
		refreshConversationMessages,
		syncConversationHistory,
		loadData,
		chat,
		composer
	]);
	const onOpenDirectConversation = useCallback((contact) => {
		const accountId = resolveWorkspaceId();
		const conversationId = directConversationId(contact.userId);
		const displayName = getContactDisplayName(contact);
		const convs = chat.getAccountConversations(accountId);
		if (!convs.find((e) => e.id === conversationId)) chat.replaceAccountConversations(accountId, [{
			id: conversationId,
			accountId,
			threadId: contact.userId,
			type: "direct",
			title: displayName,
			avatar: contact.avatar,
			lastMessageText: "Nhan de mo chat",
			lastMessageKind: "text",
			lastMessageTimestamp: (/* @__PURE__ */ new Date(0)).toISOString(),
			lastDirection: "incoming",
			messageCount: 0,
			unreadCount: 0
		}, ...convs]);
		onSelectConversation(conversationId);
	}, [
		chat,
		resolveWorkspaceId,
		onSelectConversation
	]);
	const onOpenGroupConversation = useCallback((group) => {
		const accountId = resolveWorkspaceId();
		const conversationId = groupConversationId(group.groupId);
		const convs = chat.getAccountConversations(accountId);
		if (!convs.find((e) => e.id === conversationId)) chat.replaceAccountConversations(accountId, [{
			id: conversationId,
			accountId,
			threadId: group.groupId,
			type: "group",
			title: group.displayName,
			avatar: group.avatar,
			lastMessageText: "Nhan de mo nhom chat",
			lastMessageKind: "text",
			lastMessageTimestamp: (/* @__PURE__ */ new Date(0)).toISOString(),
			lastDirection: "incoming",
			messageCount: 0,
			unreadCount: 0
		}, ...convs]);
		onSelectConversation(conversationId);
	}, [
		chat,
		resolveWorkspaceId,
		onSelectConversation
	]);
	const onLoadOlder = useCallback(() => {
		const accountId = resolveWorkspaceId();
		if (!accountId) return;
		loadOlderMessages(accountId, chat.activeConversationId, chat.messages, chat.hasMoreHistory, chat.loadingOlder, chat.setLoadingOlder, chat.setHasMoreHistory, composer.setLoadError, (aid, cid, incoming) => {
			const { next } = messageCache.prependMessages(aid, cid, incoming);
			if (activeConversationIdRef.current === cid) chat.setMessages(next);
			return { next };
		}, (aid, cid, bmid, readAt) => syncConversationHistory(aid, cid, bmid, readAt, (a, c) => refreshConversationMessages(a, c, messageCache.mergeMessagesIntoConversation, chat.setHasMoreHistory, selectionTokenRef, activeConversationIdRef, messagesEndRef), chat.setSyncingHistory, composer.setStatusMsg, chat.setHasMoreHistory, chat.replaceAccountConversations, selectionTokenRef, activeConversationIdRef), { current: null });
	}, [
		resolveWorkspaceId,
		loadOlderMessages,
		chat.activeConversationId,
		chat.messages,
		chat.hasMoreHistory,
		chat.loadingOlder,
		messageCache,
		syncConversationHistory,
		refreshConversationMessages,
		chat,
		composer
	]);
	const scrollDebounceRef = useRef(null);
	const onMessagesScroll = useCallback((e) => {
		if (e.currentTarget.scrollTop > 32) return;
		if (scrollDebounceRef.current) clearTimeout(scrollDebounceRef.current);
		scrollDebounceRef.current = setTimeout(() => {
			onLoadOlder();
		}, 150);
	}, [onLoadOlder]);
	const onSend = useCallback((e) => {
		const accountId = resolveWorkspaceId();
		handleSend(e, chat.activeConversationId, composer.text, composer.attachFile, accountId, composer.setText, composer.setAttachFile, composer.setSending, composer.setStatusMsg, composer.setLoadError, chat.replaceAccountConversations, chat.setMessages, messageCache.mergeMessagesIntoConversation, fileInputRef, chat.appendLocalMessage, chat.updateConversationSummaryLocal);
	}, [
		resolveWorkspaceId,
		handleSend,
		chat.activeConversationId,
		composer.text,
		composer.attachFile,
		messageCache,
		chat,
		composer
	]);
	const onKeyDown = useCallback((e) => {
		handleKeyDown(e, onSend);
	}, [handleKeyDown, onSend]);
	const onReactMessage = useCallback(async (message, reaction) => {
		const accountId = resolveWorkspaceId();
		if (!accountId || !message.providerMessageId) {
			if (message.providerMessageId) composer.setStatusMsg("Chua chon account de gui reaction");
			else composer.setStatusMsg("Tin nhan nay chua co ID de gui reaction");
			return;
		}
		let cliMsgId = message.cliMsgId?.trim() || "";
		if (!cliMsgId && message.rawMessageJson) try {
			const raw = JSON.parse(message.rawMessageJson);
			const data = raw.data ?? raw;
			cliMsgId = String(raw.cliMsgId ?? data?.cliMsgId ?? raw.message?.cliMsgId ?? raw.content?.cliMsgId ?? "").trim();
		} catch {
			cliMsgId = "";
		}
		if (!cliMsgId) cliMsgId = message.providerMessageId;
		try {
			await bff.sendReaction(accountId, message.conversationId, message.providerMessageId, cliMsgId, reaction.icon);
		} catch (err) {
			composer.setLoadError(err instanceof Error ? err.message : "Gui reaction that bai");
		}
	}, [resolveWorkspaceId, composer]);
	const onRefresh = useCallback(() => {
		const id = resolveWorkspaceId();
		if (id) loadData(id, status, { refresh: true }, chat.setContacts, chat.setGroups, chat.replaceAccountConversations, composer.setLoadError);
	}, [
		resolveWorkspaceId,
		status,
		loadData,
		chat,
		composer
	]);
	const onRenameAccount = useCallback(async (nextDisplayName) => {
		const accountId = resolveWorkspaceId();
		if (!accountId) throw new Error("Chua co account duoc chon");
		const updatedAccount = (await bff.updateAccountProfile(accountId, { hubAlias: nextDisplayName })).account;
		if (updatedAccount) workspace.addOrUpdateAccount(updatedAccount);
		composer.setStatusMsg("Da cap nhat alias account.");
	}, [
		resolveWorkspaceId,
		workspace,
		composer
	]);
	const visibleConversations = useMemo(() => chat.getAccountConversations(resolveWorkspaceId()), [
		chat,
		resolveWorkspaceId,
		workspace.selectedAccountId,
		chat.conversationsByAccount
	]);
	const activeConversation = useMemo(() => visibleConversations.find((e) => e.id === chat.activeConversationId), [visibleConversations, chat.activeConversationId]);
	const activeName = activeConversation?.title ?? chat.activeConversationId;
	const isGroupConversation = activeConversation?.type === "group";
	const currentAccountId = status?.account?.userId ?? "";
	const activeContact = useMemo(() => {
		if (!activeConversation || activeConversation.type !== "direct") return void 0;
		return chat.contacts.find((contact) => directConversationId(contact.userId) === activeConversation.id);
	}, [activeConversation, chat.contacts]);
	const activeGroup = useMemo(() => {
		if (!activeConversation || activeConversation.type !== "group") return void 0;
		return chat.groups.find((group) => groupConversationId(group.groupId) === activeConversation.id);
	}, [activeConversation, chat.groups]);
	const activeAvatar = activeContact?.avatar ?? activeGroup?.avatar ?? activeConversation?.avatar;
	const activeSubtitle = activeContact?.status?.trim() || activeContact?.phoneNumber?.trim() || (activeGroup?.memberCount ? `${activeGroup.memberCount} thanh vien` : "") || activeConversation?.threadId || activeConversation?.id || chat.activeConversationId;
	const sidebarAccounts = useMemo(() => {
		let list;
		if (currentAccountId && !workspace.knownAccounts.some((e) => e.accountId === currentAccountId)) list = [...workspace.knownAccounts, {
			accountId: currentAccountId,
			displayName: status?.account?.displayName ?? currentAccountId,
			phoneNumber: status?.account?.phoneNumber,
			avatar: status?.account?.avatar,
			isActive: true
		}];
		else list = workspace.knownAccounts;
		return list.map((a) => ({
			...a,
			visible: myAccountsMap.has(a.accountId) ? myAccountsMap.get(a.accountId) : true
		}));
	}, [
		currentAccountId,
		workspace.knownAccounts,
		status?.account?.avatar,
		status?.account?.displayName,
		status?.account?.phoneNumber,
		myAccountsMap
	]);
	const workspaceAccount = useMemo(() => {
		const workspaceId = resolveWorkspaceId();
		return sidebarAccounts.find((account) => account.accountId === workspaceId);
	}, [resolveWorkspaceId, sidebarAccounts]);
	useEffect(() => {
		const visibleAccountIds = sidebarAccounts.filter((account) => account.visible !== false && account.sessionActive === true).map((account) => account.accountId).filter(Boolean);
		if (visibleAccountIds.length === 0) return;
		Promise.all(visibleAccountIds.map(async (accountId) => {
			try {
				const result = await bff.chatGetConversations(accountId);
				chat.setSidebarConversationsForAccount(accountId, result.conversations);
			} catch {}
		}));
	}, [sidebarAccounts, chat.setSidebarConversationsForAccount]);
	return {
		navigate,
		workspace,
		chat,
		composer,
		user,
		status,
		detailsOpen,
		setDetailsOpen,
		currentAccountId,
		sidebarAccounts,
		workspaceAccount,
		filteredConversations: useMemo(() => {
			const q = workspace.query.trim().toLowerCase();
			const conversations = resolveConversationSummaries(visibleConversations);
			if (!q) return conversations;
			return conversations.filter((e) => e.title.toLowerCase().includes(q));
		}, [
			visibleConversations,
			workspace.query,
			resolveConversationSummaries
		]),
		filteredContacts: useMemo(() => {
			const q = workspace.query.trim().toLowerCase();
			if (!q) return chat.contacts;
			return chat.contacts.filter((e) => getContactDisplayName(e).toLowerCase().includes(q));
		}, [chat.contacts, workspace.query]),
		filteredGroups: useMemo(() => {
			const q = workspace.query.trim().toLowerCase();
			if (!q) return chat.groups;
			return chat.groups.filter((e) => e.displayName.toLowerCase().includes(q));
		}, [chat.groups, workspace.query]),
		visibleConversations,
		activeConversation,
		activeContact,
		activeGroup,
		activeName,
		activeAvatar,
		activeSubtitle,
		isGroupConversation,
		fileInputRef,
		resolveWorkspaceId,
		onSelectAccount,
		onSelectConversation,
		onOpenDirectConversation,
		onOpenGroupConversation,
		onMessagesScroll,
		onKeyDown,
		onSend,
		onReactMessage,
		onRenameAccount,
		onRefresh
	};
}
//#endregion
//#region src/features/chat/DashboardPage.tsx
function DesktopDashboardPage({ dashboard }) {
	const { navigate, workspace, chat, composer, status, detailsOpen, setDetailsOpen, currentAccountId, sidebarAccounts, workspaceAccount, filteredConversations, filteredContacts, filteredGroups, activeConversation, activeContact, activeGroup, activeName, activeAvatar, activeSubtitle, isGroupConversation, fileInputRef, resolveWorkspaceId, onSelectAccount, onSelectConversation, onOpenDirectConversation, onOpenGroupConversation, onMessagesScroll, onKeyDown, onSend, onReactMessage, onRenameAccount } = dashboard;
	return /* @__PURE__ */ jsx(TooltipProvider, {
		delayDuration: 300,
		children: /* @__PURE__ */ jsxs("div", {
			className: "flex w-full h-dvh overflow-hidden",
			children: [
				/* @__PURE__ */ jsx(MiniSidebar, {
					accounts: sidebarAccounts,
					selectedAccountId: workspace.selectedAccountId,
					currentAccountId,
					conversations: Object.values(chat.conversationsByAccount).flat(),
					onSelectAccount,
					onOpenAdmin: () => navigate("/admin")
				}),
				/* @__PURE__ */ jsx(Sidebar, {
					sidebarTab: workspace.sidebarTab,
					onTabChange: workspace.setSidebarTab,
					query: workspace.query,
					onQueryChange: workspace.setQuery,
					conversations: filteredConversations,
					contacts: filteredContacts,
					groups: filteredGroups,
					activeConversationId: chat.activeConversationId,
					workspaceAccountId: resolveWorkspaceId(),
					accountHubAlias: workspaceAccount?.hubAlias,
					accountDisplayName: workspaceAccount?.displayName ?? status?.account?.displayName,
					accountAvatar: workspaceAccount?.avatar ?? status?.account?.avatar,
					accountPhoneNumber: workspaceAccount?.phoneNumber ?? status?.account?.phoneNumber,
					onRenameAccount,
					onSelectConversation,
					onOpenDirectConversation,
					onOpenGroupConversation
				}),
				/* @__PURE__ */ jsxs("div", {
					className: "flex-1 min-w-0 flex relative",
					children: [/* @__PURE__ */ jsx(ChatPanel, {
						activeConversationId: chat.activeConversationId,
						activeConversation,
						activeName,
						activeAvatar,
						activeSubtitle,
						isGroupConversation,
						messages: chat.messages,
						hasMoreHistory: chat.hasMoreHistory,
						loadingOlder: chat.loadingOlder,
						syncingHistory: chat.syncingHistory,
						statusMsg: composer.statusMsg,
						loadError: composer.loadError,
						text: composer.text,
						attachFile: composer.attachFile,
						sending: composer.sending,
						typingUsers: [],
						detailsOpen,
						onScroll: onMessagesScroll,
						onTextChange: composer.setText,
						onKeyDown,
						onSend,
						onAttachFile: composer.setAttachFile,
						onClearFile: () => {
							composer.setAttachFile(null);
							if (fileInputRef.current) fileInputRef.current.value = "";
						},
						onToggleDetails: () => setDetailsOpen((open) => !open),
						onReactMessage,
						showDisconnectBanner: status ? !status.sessionActive && !status.loginInProgress && !!workspace.selectedAccountId : false
					}), /* @__PURE__ */ jsx(ConversationDetailsPanel, {
						open: detailsOpen,
						conversation: activeConversation,
						contact: activeContact,
						group: activeGroup,
						workspaceAccount,
						onClose: () => setDetailsOpen(false)
					})]
				})
			]
		})
	});
}
function MobileDashboardPage({ dashboard }) {
	const { navigate, workspace, chat, composer, status, detailsOpen, setDetailsOpen, currentAccountId, sidebarAccounts, workspaceAccount, filteredConversations, filteredContacts, filteredGroups, activeConversation, activeContact, activeGroup, activeName, activeAvatar, activeSubtitle, isGroupConversation, fileInputRef, resolveWorkspaceId, onSelectAccount, onSelectConversation, onOpenDirectConversation, onOpenGroupConversation, onMessagesScroll, onKeyDown, onSend, onReactMessage, onRenameAccount } = dashboard;
	const [screen, setScreen] = useState("list");
	useEffect(() => {
		if (!chat.activeConversationId) setScreen("list");
	}, [chat.activeConversationId]);
	const handleSelectConversation = (conversationId) => {
		setScreen("chat");
		onSelectConversation(conversationId);
	};
	const handleOpenDirectConversation = (contact) => {
		setScreen("chat");
		onOpenDirectConversation(contact);
	};
	const handleOpenGroupConversation = (group) => {
		setScreen("chat");
		onOpenGroupConversation(group);
	};
	return /* @__PURE__ */ jsx(TooltipProvider, {
		delayDuration: 300,
		children: /* @__PURE__ */ jsxs("div", {
			className: "flex w-full h-dvh bg-[var(--background)]",
			children: [screen === "list" && /* @__PURE__ */ jsxs("div", {
				className: "flex h-dvh w-full flex-col",
				children: [/* @__PURE__ */ jsxs("div", {
					className: "border-b border-[var(--border)] bg-[rgba(9,12,18,0.96)] px-3 py-3 backdrop-blur",
					children: [/* @__PURE__ */ jsxs("div", {
						className: "flex items-center gap-2",
						children: [/* @__PURE__ */ jsx(Button, {
							type: "button",
							variant: "ghost",
							size: "sm",
							className: "h-9 px-3 text-xs",
							onClick: () => navigate("/admin"),
							children: "Admin"
						}), /* @__PURE__ */ jsxs("div", {
							className: "min-w-0 flex-1",
							children: [/* @__PURE__ */ jsx("div", {
								className: "truncate text-sm font-semibold text-[#eef2ff]",
								children: "Zalo Hub Mobile"
							}), /* @__PURE__ */ jsx("div", {
								className: "truncate text-[11px] text-muted-foreground",
								children: (workspaceAccount?.displayName ?? status?.account?.displayName ?? resolveWorkspaceId()) || "Chưa chọn account"
							})]
						})]
					}), /* @__PURE__ */ jsx("div", {
						className: "mt-3 flex gap-2 overflow-x-auto pb-1",
						children: sidebarAccounts.filter((account) => account.visible !== false).map((account) => {
							return /* @__PURE__ */ jsx("button", {
								type: "button",
								onClick: () => onSelectAccount(account.accountId),
								className: `shrink-0 rounded-full border px-3 py-1.5 text-xs transition-colors ${account.accountId === (workspace.selectedAccountId || currentAccountId) ? "border-[rgba(95,212,255,0.34)] bg-[rgba(79,122,255,0.18)] text-[#dfe9ff]" : "border-white/10 bg-white/4 text-muted-foreground"}`,
								children: account.hubAlias ?? account.displayName ?? account.accountId
							}, account.accountId);
						})
					})]
				}), /* @__PURE__ */ jsx(Sidebar, {
					className: "w-full min-w-0 flex-1 border-r-0 max-sm:w-full max-sm:min-w-0",
					sidebarTab: workspace.sidebarTab,
					onTabChange: workspace.setSidebarTab,
					query: workspace.query,
					onQueryChange: workspace.setQuery,
					conversations: filteredConversations,
					contacts: filteredContacts,
					groups: filteredGroups,
					activeConversationId: chat.activeConversationId,
					workspaceAccountId: resolveWorkspaceId(),
					accountHubAlias: workspaceAccount?.hubAlias,
					accountDisplayName: workspaceAccount?.displayName ?? status?.account?.displayName,
					accountAvatar: workspaceAccount?.avatar ?? status?.account?.avatar,
					accountPhoneNumber: workspaceAccount?.phoneNumber ?? status?.account?.phoneNumber,
					onRenameAccount,
					onSelectConversation: handleSelectConversation,
					onOpenDirectConversation: handleOpenDirectConversation,
					onOpenGroupConversation: handleOpenGroupConversation
				})]
			}), screen === "chat" && /* @__PURE__ */ jsxs("div", {
				className: "relative flex h-dvh w-full flex-col overflow-hidden",
				children: [
					/* @__PURE__ */ jsx(ChatPanel, {
						activeConversationId: chat.activeConversationId,
						activeConversation,
						activeName,
						activeAvatar,
						activeSubtitle,
						isGroupConversation,
						headerLeading: /* @__PURE__ */ jsx(Button, {
							type: "button",
							variant: "ghost",
							size: "sm",
							className: "h-8 shrink-0 px-2 text-xs",
							onClick: () => setScreen("list"),
							children: "← DS"
						}),
						messages: chat.messages,
						hasMoreHistory: chat.hasMoreHistory,
						loadingOlder: chat.loadingOlder,
						syncingHistory: chat.syncingHistory,
						statusMsg: composer.statusMsg,
						loadError: composer.loadError,
						text: composer.text,
						attachFile: composer.attachFile,
						sending: composer.sending,
						typingUsers: [],
						detailsOpen,
						onScroll: onMessagesScroll,
						onTextChange: composer.setText,
						onKeyDown,
						onSend,
						onAttachFile: composer.setAttachFile,
						onClearFile: () => {
							composer.setAttachFile(null);
							if (fileInputRef.current) fileInputRef.current.value = "";
						},
						onToggleDetails: () => setDetailsOpen((open) => !open),
						onReactMessage,
						showDisconnectBanner: status ? !status.sessionActive && !status.loginInProgress && !!workspace.selectedAccountId : false
					}),
					detailsOpen && /* @__PURE__ */ jsx("div", {
						className: "absolute inset-0 z-10 bg-black/40",
						onClick: () => setDetailsOpen(false),
						"aria-hidden": "true"
					}),
					/* @__PURE__ */ jsx(ConversationDetailsPanel, {
						open: detailsOpen,
						conversation: activeConversation,
						contact: activeContact,
						group: activeGroup,
						workspaceAccount,
						onClose: () => setDetailsOpen(false)
					})
				]
			})]
		})
	});
}
function DashboardPage({ mobileMode, dashboard }) {
	const resolvedDashboard = dashboard ?? useDashboardState();
	return mobileMode ? /* @__PURE__ */ jsx(MobileDashboardPage, { dashboard: resolvedDashboard }) : /* @__PURE__ */ jsx(DesktopDashboardPage, { dashboard: resolvedDashboard });
}
//#endregion
//#region src/hooks/useHydrate.ts
function useHydrate() {
	const data = useLoaderData();
	const auth = useAuthStore();
	const workspace = useWorkspaceStore();
	useEffect(() => {
		if (data?.user) auth.setUser(data.user);
		if (data?.init) {
			if (data.init.accounts) {
				workspace.setKnownAccounts(data.init.accounts.accounts.map((a) => ({
					accountId: a.accountId,
					hubAlias: a.hubAlias,
					displayName: a.account?.displayName ?? a.displayName,
					phoneNumber: a.account?.phoneNumber ?? a.phoneNumber,
					avatar: a.account?.avatar ?? a.avatar,
					isActive: a.isActive,
					hasCredential: a.hasCredential,
					runtimeLoaded: a.runtimeLoaded,
					sessionActive: a.sessionActive
				})));
				if (data.init.accounts.activeAccountId) workspace.setSelectedAccountId(data.init.accounts.activeAccountId);
			}
		}
	}, [
		data,
		auth,
		workspace
	]);
}
//#endregion
//#region app/routes/_index.tsx
var _index_exports = /* @__PURE__ */ __exportAll({
	default: () => _index_default,
	loader: () => loader$3
});
async function loader$3({ request }) {
	const cookie = request.headers.get("cookie") || "";
	const authRes = await serverFetch("/bff/auth/me", cookie);
	if (!authRes.ok) throw redirect("/login");
	const authBody = await authRes.json();
	const initRes = await serverFetch("/bff/workspace/init", cookie, { method: "POST" });
	const initBody = initRes.ok ? await initRes.json() : null;
	return {
		user: authBody?.data?.user ?? null,
		init: initBody?.data ?? null
	};
}
var _index_default = UNSAFE_withComponentProps(function IndexRoute() {
	useHydrate();
	return /* @__PURE__ */ jsx(DashboardPage, { mobileMode: false });
});
//#endregion
//#region src/components/ui/label.tsx
function Label$1({ className, ...props }) {
	return /* @__PURE__ */ jsx(Label.Root, {
		"data-slot": "label",
		className: cn("flex items-center gap-2 text-sm leading-none font-medium select-none group-data-[disabled=true]:pointer-events-none group-data-[disabled=true]:opacity-50 peer-disabled:cursor-not-allowed peer-disabled:opacity-50", className),
		...props
	});
}
//#endregion
//#region src/components/ui/card.tsx
function Card({ className, ...props }) {
	return /* @__PURE__ */ jsx("div", {
		"data-slot": "card",
		className: cn("flex flex-col gap-6 rounded-xl border bg-card py-6 text-card-foreground shadow-sm", className),
		...props
	});
}
function CardHeader({ className, ...props }) {
	return /* @__PURE__ */ jsx("div", {
		"data-slot": "card-header",
		className: cn("@container/card-header grid auto-rows-min grid-rows-[auto_auto] items-start gap-2 px-6 has-data-[slot=card-action]:grid-cols-[1fr_auto] [.border-b]:pb-6", className),
		...props
	});
}
function CardTitle({ className, ...props }) {
	return /* @__PURE__ */ jsx("div", {
		"data-slot": "card-title",
		className: cn("leading-none font-semibold", className),
		...props
	});
}
function CardContent({ className, ...props }) {
	return /* @__PURE__ */ jsx("div", {
		"data-slot": "card-content",
		className: cn("px-6", className),
		...props
	});
}
//#endregion
//#region src/features/auth/components/LoginPage.tsx
function LoginPage() {
	const [email, setEmail] = useState("");
	const [password, setPassword] = useState("");
	const [error, setError] = useState("");
	const { login, isLoading } = useAuthStore();
	const navigate = useNavigate();
	const handleSubmit = async (e) => {
		e.preventDefault();
		setError("");
		const result = await login(email, password);
		if (result.ok) navigate("/");
		else setError(result.error || "Lỗi đăng nhập");
	};
	return /* @__PURE__ */ jsxs("div", {
		className: "flex-1 flex items-center justify-center flex-col gap-6 bg-gradient-to-br from-[#0f1117] to-[#1a2035] min-h-screen",
		children: [
			/* @__PURE__ */ jsx("h1", {
				className: "text-[32px] font-bold text-white m-0",
				children: "Zalo Hub"
			}),
			/* @__PURE__ */ jsx("p", {
				className: "text-[#888] text-[15px] m-0",
				children: "Đăng nhập vào hệ thống"
			}),
			/* @__PURE__ */ jsxs(Card, {
				className: "bg-white/5 border-white/10 p-8 w-[360px] flex flex-col gap-4",
				children: [/* @__PURE__ */ jsxs("form", {
					onSubmit: handleSubmit,
					className: "flex flex-col gap-4",
					children: [
						/* @__PURE__ */ jsxs("div", {
							className: "flex flex-col gap-2",
							children: [/* @__PURE__ */ jsx(Label$1, {
								htmlFor: "email",
								className: "text-[#ccc]",
								children: "Email"
							}), /* @__PURE__ */ jsx(Input, {
								id: "email",
								type: "email",
								value: email,
								onChange: (e) => setEmail(e.target.value),
								placeholder: "admin@zalohub.local",
								className: "h-10",
								autoFocus: true
							})]
						}),
						/* @__PURE__ */ jsxs("div", {
							className: "flex flex-col gap-2",
							children: [/* @__PURE__ */ jsx(Label$1, {
								htmlFor: "password",
								className: "text-[#ccc]",
								children: "Mật khẩu"
							}), /* @__PURE__ */ jsx(Input, {
								id: "password",
								type: "password",
								value: password,
								onChange: (e) => setPassword(e.target.value),
								placeholder: "••••••••",
								className: "h-10"
							})]
						}),
						error && /* @__PURE__ */ jsx("p", {
							className: "text-[#ff8888] text-[13px] m-0",
							children: error
						}),
						/* @__PURE__ */ jsx(Button, {
							type: "submit",
							disabled: isLoading,
							className: "w-full",
							children: isLoading ? "Đang đăng nhập..." : "Đăng nhập"
						})
					]
				}), /* @__PURE__ */ jsx("p", {
					className: "text-[#666] text-xs text-center m-0",
					children: "Mặc định: admin@zalohub.local / admin123"
				})]
			})
		]
	});
}
//#endregion
//#region app/routes/login.tsx
var login_exports = /* @__PURE__ */ __exportAll({
	default: () => login_default,
	loader: () => loader$2
});
async function loader$2({ request }) {
	const cookie = request.headers.get("cookie") || "";
	if (cookie.includes("zalohub_token")) {
		const BFF_URL = process.env.BFF_URL || "http://127.0.0.1:3401";
		try {
			if ((await fetch(`${BFF_URL}/bff/auth/me`, { headers: { cookie } })).ok) return redirect("/");
		} catch {}
	}
	return null;
}
var login_default = UNSAFE_withComponentProps(function LoginRoute() {
	return /* @__PURE__ */ jsx(LoginPage, {});
});
//#endregion
//#region app/routes/m.tsx
var m_exports = /* @__PURE__ */ __exportAll({
	default: () => m_default,
	loader: () => loader$1
});
async function loader$1({ request }) {
	const cookie = request.headers.get("cookie") || "";
	const authRes = await serverFetch("/bff/auth/me", cookie);
	if (!authRes.ok) throw redirect("/login");
	const authBody = await authRes.json();
	const initRes = await serverFetch("/bff/workspace/init", cookie, { method: "POST" });
	const initBody = initRes.ok ? await initRes.json() : null;
	return {
		user: authBody?.data?.user ?? null,
		init: initBody?.data ?? null
	};
}
var m_default = UNSAFE_withComponentProps(function MobileRoute() {
	useHydrate();
	return /* @__PURE__ */ jsx(DashboardPage, { mobileMode: true });
});
//#endregion
//#region src/components/ui/badge.tsx
var badgeVariants = cva("inline-flex w-fit shrink-0 items-center justify-center gap-1 overflow-hidden rounded-full border border-transparent px-2 py-0.5 text-xs font-medium whitespace-nowrap transition-[color,box-shadow] focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 aria-invalid:border-destructive aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 [&>svg]:pointer-events-none [&>svg]:size-3", {
	variants: { variant: {
		default: "bg-primary text-primary-foreground [a&]:hover:bg-primary/90",
		secondary: "bg-secondary text-secondary-foreground [a&]:hover:bg-secondary/90",
		destructive: "bg-destructive text-white focus-visible:ring-destructive/20 dark:bg-destructive/60 dark:focus-visible:ring-destructive/40 [a&]:hover:bg-destructive/90",
		outline: "border-border text-foreground [a&]:hover:bg-accent [a&]:hover:text-accent-foreground",
		ghost: "[a&]:hover:bg-accent [a&]:hover:text-accent-foreground",
		link: "text-primary underline-offset-4 [a&]:hover:underline"
	} },
	defaultVariants: { variant: "default" }
});
function Badge({ className, variant = "default", asChild = false, ...props }) {
	return /* @__PURE__ */ jsx(asChild ? Slot.Root : "span", {
		"data-slot": "badge",
		"data-variant": variant,
		className: cn(badgeVariants({ variant }), className),
		...props
	});
}
//#endregion
//#region src/features/accounts/components/QrLoginDialog.tsx
function QrLoginDialog({ open, onOpenChange, onSuccess, accountId }) {
	const [qrCode, setQrCode] = useState(null);
	const [status, setStatus] = useState("");
	const timerRef = useRef(null);
	const isReconnect = Boolean(accountId);
	useEffect(() => {
		if (!open) {
			if (timerRef.current) clearInterval(timerRef.current);
			timerRef.current = null;
			return;
		}
		setQrCode(null);
		setStatus("Đang tạo QR...");
		const startFn = isReconnect ? () => bff.reconnectStart(accountId) : () => bff.loginStart();
		const qrFn = isReconnect ? () => bff.reconnectQr(accountId) : () => bff.loginQr();
		startFn().then(() => {
			timerRef.current = setInterval(async () => {
				try {
					const qr = await qrFn();
					if (qr.qrCode) {
						setQrCode(qr.qrCode);
						setStatus(isReconnect ? "Quét mã QR bằng Zalo để đăng nhập lại" : "Quét mã QR bằng Zalo để thêm tài khoản");
					}
					const st = await bff.accountStatus(accountId ?? "");
					if (st.loggedIn && st.sessionActive) {
						if (timerRef.current) clearInterval(timerRef.current);
						timerRef.current = null;
						setStatus("Đăng nhập thành công!");
						setTimeout(() => {
							onSuccess();
							onOpenChange(false);
						}, 1e3);
					}
				} catch {}
			}, 2e3);
		}).catch(() => setStatus("Lỗi tạo QR"));
		return () => {
			if (timerRef.current) clearInterval(timerRef.current);
			timerRef.current = null;
		};
	}, [
		open,
		isReconnect,
		accountId,
		onOpenChange,
		onSuccess
	]);
	return /* @__PURE__ */ jsx(Dialog$1, {
		open,
		onOpenChange,
		children: /* @__PURE__ */ jsxs(DialogContent, {
			className: "bg-[#111] border-[var(--border)] max-w-sm",
			children: [/* @__PURE__ */ jsx(DialogHeader, { children: /* @__PURE__ */ jsx(DialogTitle, {
				className: "text-[#eee]",
				children: isReconnect ? "Đăng nhập lại tài khoản Zalo" : "Thêm tài khoản Zalo"
			}) }), /* @__PURE__ */ jsxs("div", {
				className: "flex flex-col items-center gap-4",
				children: [qrCode ? /* @__PURE__ */ jsx("img", {
					src: qrCode.startsWith("data:") ? qrCode : `data:image/png;base64,${qrCode}`,
					alt: "QR Code",
					className: "w-48 h-48 rounded-lg border border-[var(--border)] bg-white p-2"
				}) : /* @__PURE__ */ jsx("div", {
					className: "w-48 h-48 rounded-lg border border-[var(--border)] bg-[#0d1015] flex items-center justify-center text-muted-foreground text-sm",
					children: "Đang tạo QR..."
				}), /* @__PURE__ */ jsx("p", {
					className: "text-[13px] text-muted-foreground text-center",
					children: status
				})]
			})]
		})
	});
}
//#endregion
//#region src/components/ui/select.tsx
function Select$1({ ...props }) {
	return /* @__PURE__ */ jsx(Select.Root, {
		"data-slot": "select",
		...props
	});
}
function SelectValue({ ...props }) {
	return /* @__PURE__ */ jsx(Select.Value, {
		"data-slot": "select-value",
		...props
	});
}
function SelectTrigger({ className, size = "default", children, ...props }) {
	return /* @__PURE__ */ jsxs(Select.Trigger, {
		"data-slot": "select-trigger",
		"data-size": size,
		className: cn("flex w-fit items-center justify-between gap-2 rounded-md border border-input bg-transparent px-3 py-2 text-sm whitespace-nowrap shadow-xs transition-[color,box-shadow] outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-destructive/20 data-[placeholder]:text-muted-foreground data-[size=default]:h-9 data-[size=sm]:h-8 *:data-[slot=select-value]:line-clamp-1 *:data-[slot=select-value]:flex *:data-[slot=select-value]:items-center *:data-[slot=select-value]:gap-2 dark:bg-input/30 dark:hover:bg-input/50 dark:aria-invalid:ring-destructive/40 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4 [&_svg:not([class*='text-'])]:text-muted-foreground", className),
		...props,
		children: [children, /* @__PURE__ */ jsx(Select.Icon, {
			asChild: true,
			children: /* @__PURE__ */ jsx(ChevronDownIcon, { className: "size-4 opacity-50" })
		})]
	});
}
function SelectContent({ className, children, position = "item-aligned", align = "center", ...props }) {
	return /* @__PURE__ */ jsx(Select.Portal, { children: /* @__PURE__ */ jsxs(Select.Content, {
		"data-slot": "select-content",
		className: cn("relative z-50 max-h-(--radix-select-content-available-height) min-w-[8rem] origin-(--radix-select-content-transform-origin) overflow-x-hidden overflow-y-auto rounded-md border bg-popover text-popover-foreground shadow-md data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95 data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95", position === "popper" && "data-[side=bottom]:translate-y-1 data-[side=left]:-translate-x-1 data-[side=right]:translate-x-1 data-[side=top]:-translate-y-1", className),
		position,
		align,
		...props,
		children: [
			/* @__PURE__ */ jsx(SelectScrollUpButton, {}),
			/* @__PURE__ */ jsx(Select.Viewport, {
				className: cn("p-1", position === "popper" && "h-[var(--radix-select-trigger-height)] w-full min-w-[var(--radix-select-trigger-width)] scroll-my-1"),
				children
			}),
			/* @__PURE__ */ jsx(SelectScrollDownButton, {})
		]
	}) });
}
function SelectItem({ className, children, ...props }) {
	return /* @__PURE__ */ jsxs(Select.Item, {
		"data-slot": "select-item",
		className: cn("relative flex w-full cursor-default items-center gap-2 rounded-sm py-1.5 pr-8 pl-2 text-sm outline-hidden select-none focus:bg-accent focus:text-accent-foreground data-[disabled]:pointer-events-none data-[disabled]:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4 [&_svg:not([class*='text-'])]:text-muted-foreground *:[span]:last:flex *:[span]:last:items-center *:[span]:last:gap-2", className),
		...props,
		children: [/* @__PURE__ */ jsx("span", {
			"data-slot": "select-item-indicator",
			className: "absolute right-2 flex size-3.5 items-center justify-center",
			children: /* @__PURE__ */ jsx(Select.ItemIndicator, { children: /* @__PURE__ */ jsx(CheckIcon, { className: "size-4" }) })
		}), /* @__PURE__ */ jsx(Select.ItemText, { children })]
	});
}
function SelectScrollUpButton({ className, ...props }) {
	return /* @__PURE__ */ jsx(Select.ScrollUpButton, {
		"data-slot": "select-scroll-up-button",
		className: cn("flex cursor-default items-center justify-center py-1", className),
		...props,
		children: /* @__PURE__ */ jsx(ChevronUpIcon, { className: "size-4" })
	});
}
function SelectScrollDownButton({ className, ...props }) {
	return /* @__PURE__ */ jsx(Select.ScrollDownButton, {
		"data-slot": "select-scroll-down-button",
		className: cn("flex cursor-default items-center justify-center py-1", className),
		...props,
		children: /* @__PURE__ */ jsx(ChevronDownIcon, { className: "size-4" })
	});
}
//#endregion
//#region src/components/ui/switch.tsx
function Switch$1({ className, size = "default", ...props }) {
	return /* @__PURE__ */ jsx(Switch.Root, {
		"data-slot": "switch",
		"data-size": size,
		className: cn("peer group/switch inline-flex shrink-0 items-center rounded-full border border-transparent shadow-xs transition-all outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 data-[size=default]:h-[1.15rem] data-[size=default]:w-8 data-[size=sm]:h-3.5 data-[size=sm]:w-6 data-[state=checked]:bg-primary data-[state=unchecked]:bg-input dark:data-[state=unchecked]:bg-input/80", className),
		...props,
		children: /* @__PURE__ */ jsx(Switch.Thumb, {
			"data-slot": "switch-thumb",
			className: cn("pointer-events-none block rounded-full bg-background ring-0 transition-transform group-data-[size=default]/switch:size-4 group-data-[size=sm]/switch:size-3 data-[state=checked]:translate-x-[calc(100%-2px)] data-[state=unchecked]:translate-x-0 dark:data-[state=checked]:bg-primary-foreground dark:data-[state=unchecked]:bg-foreground")
		})
	});
}
//#endregion
//#region src/features/accounts/components/MyAccountsTab.tsx
var ROLE_LABELS = {
	master: "Master",
	admin: "Admin",
	editor: "Editor",
	viewer: "Viewer"
};
var ROLE_COLORS = {
	master: "bg-[rgba(235,87,87,0.15)] text-[#eb5757]",
	admin: "bg-[rgba(79,122,255,0.15)] text-[#9fc0ff]",
	editor: "bg-[rgba(60,200,120,0.15)] text-[#6fe0a0]",
	viewer: "bg-white/10 text-muted-foreground"
};
function MyAccountsTab({ setError, setStatus }) {
	const [accounts, setAccounts] = useState([]);
	const [loading, setLoading] = useState(true);
	const [selectedAccount, setSelectedAccount] = useState(null);
	const [members, setMembers] = useState([]);
	const [memberEmail, setMemberEmail] = useState("");
	const [memberRole, setMemberRole] = useState("viewer");
	const [addOpen, setAddOpen] = useState(false);
	const [transferOpen, setTransferOpen] = useState(false);
	const [transferEmail, setTransferEmail] = useState("");
	const [qrOpen, setQrOpen] = useState(false);
	const [reconnectId, setReconnectId] = useState(null);
	const loadAccounts = async () => {
		try {
			setAccounts((await bff.myAccounts()).accounts);
		} catch {
			setError("Không thể tải danh sách tài khoản");
		}
		setLoading(false);
	};
	const loadMembers = async (accountId) => {
		try {
			setMembers((await bff.adminUsers()).users.filter((u) => u.memberships.some((m) => m.account_id === accountId)).map((u) => ({
				userId: u.id,
				displayName: u.displayName,
				email: u.email,
				role: u.memberships.find((m) => m.account_id === accountId)?.role || "viewer"
			})));
		} catch {}
	};
	useEffect(() => {
		loadAccounts();
	}, []);
	const handleManage = (account) => {
		setSelectedAccount(account);
		if (account.role === "master" || account.role === "admin") loadMembers(account.accountId);
	};
	const handleAddMember = async () => {
		if (!selectedAccount || !memberEmail) return;
		try {
			await bff.adminAddMember(selectedAccount.accountId, memberEmail, memberRole);
			setStatus("Đã thêm thành viên");
			setMemberEmail("");
			setAddOpen(false);
			loadMembers(selectedAccount.accountId);
		} catch (e) {
			setError(e.message || "Thêm thất bại");
		}
	};
	const handleRemoveMember = async (userId) => {
		if (!selectedAccount) return;
		try {
			await bff.adminRemoveMember(selectedAccount.accountId, userId);
			setStatus("Đã xóa thành viên");
			loadMembers(selectedAccount.accountId);
		} catch (e) {
			setError(e.message || "Xóa thất bại");
		}
	};
	const handleChangeRole = async (userId, newRole) => {
		if (!selectedAccount) return;
		try {
			await bff.adminUpdateMemberRole(selectedAccount.accountId, userId, newRole);
			setStatus("Đã cập nhật quyền");
			loadMembers(selectedAccount.accountId);
			loadAccounts();
		} catch (e) {
			setError(e.message || "Cập nhật thất bại");
		}
	};
	const handleTransferMaster = async () => {
		if (!selectedAccount || !transferEmail) return;
		try {
			const targetUser = (await bff.adminUsers()).users.find((u) => u.email === transferEmail);
			if (!targetUser) {
				setError("Không tìm thấy user");
				return;
			}
			await bff.adminTransferMaster(selectedAccount.accountId, targetUser.id);
			setStatus("Đã chuyển quyền master. Bạn hiện là admin.");
			setTransferOpen(false);
			setTransferEmail("");
			loadAccounts();
			loadMembers(selectedAccount.accountId);
		} catch (e) {
			setError(e.message || "Chuyển quyền thất bại");
		}
	};
	const handleToggleVisible = async (acc) => {
		const newVal = !acc.visible;
		try {
			await bff.setAccountVisible(acc.accountId, newVal);
			setAccounts((accts) => accts.map((a) => a.accountId === acc.accountId ? {
				...a,
				visible: newVal
			} : a));
		} catch {
			setError("Cập nhật visible thất bại");
		}
	};
	if (loading) return /* @__PURE__ */ jsx("p", {
		className: "text-muted-foreground text-sm",
		children: "Đang tải..."
	});
	const visibleAccounts = accounts.filter((a) => a.visible);
	const hiddenAccounts = accounts.filter((a) => !a.visible);
	return /* @__PURE__ */ jsxs("div", { children: [
		/* @__PURE__ */ jsxs("div", {
			className: "flex items-center justify-between mb-4 gap-3",
			children: [/* @__PURE__ */ jsx("h2", {
				className: "text-sm font-bold text-[#eee]",
				children: "Tài khoản Zalo của tôi"
			}), /* @__PURE__ */ jsx(Button, {
				size: "sm",
				className: "text-[11px] h-8",
				onClick: () => setQrOpen(true),
				children: "+ Thêm tài khoản (QR)"
			})]
		}),
		/* @__PURE__ */ jsxs("div", {
			className: "space-y-3",
			children: [
				visibleAccounts.map((acc) => /* @__PURE__ */ jsx(AccountCard, {
					acc,
					selectedAccount,
					members,
					onManage: handleManage,
					onToggleVisible: handleToggleVisible,
					onReconnect: (id) => setReconnectId(id),
					onDeselect: () => setSelectedAccount(null),
					onAddMember: () => setAddOpen(true),
					onTransferMaster: () => setTransferOpen(true),
					onChangeRole: handleChangeRole,
					onRemoveMember: handleRemoveMember
				}, acc.accountId)),
				hiddenAccounts.length > 0 && /* @__PURE__ */ jsxs(Fragment, { children: [/* @__PURE__ */ jsxs("div", {
					className: "flex items-center gap-2 mt-6 mb-3",
					children: [
						/* @__PURE__ */ jsx("div", { className: "flex-1 h-px bg-white/10" }),
						/* @__PURE__ */ jsxs("span", {
							className: "text-[11px] text-muted-foreground shrink-0",
							children: [
								"Tài khoản ẩn (",
								hiddenAccounts.length,
								")"
							]
						}),
						/* @__PURE__ */ jsx("div", { className: "flex-1 h-px bg-white/10" })
					]
				}), hiddenAccounts.map((acc) => /* @__PURE__ */ jsx(AccountCard, {
					acc,
					selectedAccount,
					members,
					onManage: handleManage,
					onToggleVisible: handleToggleVisible,
					onReconnect: (id) => setReconnectId(id),
					onDeselect: () => setSelectedAccount(null),
					onAddMember: () => setAddOpen(true),
					onTransferMaster: () => setTransferOpen(true),
					onChangeRole: handleChangeRole,
					onRemoveMember: handleRemoveMember
				}, acc.accountId))] }),
				accounts.length === 0 && /* @__PURE__ */ jsxs("p", {
					className: "text-sm text-muted-foreground",
					children: [
						"Bạn chưa có tài khoản Zalo nào.",
						" ",
						/* @__PURE__ */ jsx("span", {
							className: "text-[#9fc0ff]",
							children: "Vào Admin để thêm tài khoản bằng QR."
						})
					]
				})
			]
		}),
		/* @__PURE__ */ jsx(Dialog$1, {
			open: addOpen,
			onOpenChange: setAddOpen,
			children: /* @__PURE__ */ jsxs(DialogContent, {
				className: "bg-[#111] border-[var(--border)] max-w-sm",
				children: [
					/* @__PURE__ */ jsx(DialogHeader, { children: /* @__PURE__ */ jsx(DialogTitle, {
						className: "text-[#eee]",
						children: "Thêm thành viên"
					}) }),
					/* @__PURE__ */ jsxs("div", {
						className: "space-y-3",
						children: [/* @__PURE__ */ jsx(Input, {
							placeholder: "Email người dùng",
							value: memberEmail,
							onChange: (e) => setMemberEmail(e.target.value),
							className: "bg-[#0d1015] border-[var(--border)]"
						}), /* @__PURE__ */ jsxs(Select$1, {
							value: memberRole,
							onValueChange: setMemberRole,
							children: [/* @__PURE__ */ jsx(SelectTrigger, {
								className: "bg-[#0d1015] border-[var(--border)]",
								children: /* @__PURE__ */ jsx(SelectValue, {})
							}), /* @__PURE__ */ jsxs(SelectContent, { children: [
								/* @__PURE__ */ jsx(SelectItem, {
									value: "viewer",
									children: "Viewer"
								}),
								/* @__PURE__ */ jsx(SelectItem, {
									value: "editor",
									children: "Editor"
								}),
								/* @__PURE__ */ jsx(SelectItem, {
									value: "admin",
									children: "Admin"
								})
							] })]
						})]
					}),
					/* @__PURE__ */ jsxs(DialogFooter, { children: [/* @__PURE__ */ jsx(Button, {
						variant: "outline",
						size: "sm",
						onClick: () => setAddOpen(false),
						children: "Hủy"
					}), /* @__PURE__ */ jsx(Button, {
						size: "sm",
						onClick: handleAddMember,
						children: "Thêm"
					})] })
				]
			})
		}),
		/* @__PURE__ */ jsx(Dialog$1, {
			open: transferOpen,
			onOpenChange: setTransferOpen,
			children: /* @__PURE__ */ jsxs(DialogContent, {
				className: "bg-[#111] border-[var(--border)] max-w-sm",
				children: [
					/* @__PURE__ */ jsx(DialogHeader, { children: /* @__PURE__ */ jsx(DialogTitle, {
						className: "text-[#eee]",
						children: "Chuyển quyền Master"
					}) }),
					/* @__PURE__ */ jsx("p", {
						className: "text-[11px] text-muted-foreground",
						children: "Chọn người nhận quyền master. Bạn sẽ trở thành Admin sau khi chuyển."
					}),
					/* @__PURE__ */ jsx(Input, {
						placeholder: "Email người nhận",
						value: transferEmail,
						onChange: (e) => setTransferEmail(e.target.value),
						className: "bg-[#0d1015] border-[var(--border)]"
					}),
					/* @__PURE__ */ jsxs(DialogFooter, { children: [/* @__PURE__ */ jsx(Button, {
						variant: "outline",
						size: "sm",
						onClick: () => setTransferOpen(false),
						children: "Hủy"
					}), /* @__PURE__ */ jsx(Button, {
						variant: "destructive",
						size: "sm",
						onClick: handleTransferMaster,
						children: "Chuyển"
					})] })
				]
			})
		}),
		/* @__PURE__ */ jsx(QrLoginDialog, {
			open: qrOpen,
			onOpenChange: setQrOpen,
			onSuccess: () => {
				setQrOpen(false);
				loadAccounts();
			}
		}),
		reconnectId && /* @__PURE__ */ jsx(QrLoginDialog, {
			open: true,
			accountId: reconnectId,
			onOpenChange: () => setReconnectId(null),
			onSuccess: () => {
				setReconnectId(null);
				loadAccounts();
			}
		})
	] });
}
function AccountCard({ acc, selectedAccount, members, onManage, onToggleVisible, onReconnect, onDeselect, onAddMember, onTransferMaster, onChangeRole, onRemoveMember }) {
	const isExpanded = selectedAccount?.accountId === acc.accountId;
	const canManage = acc.role === "master" || acc.role === "admin";
	return /* @__PURE__ */ jsx(Card, {
		className: `border-[var(--border)] bg-[#0d1015] ${acc.visible ? "" : "opacity-60"}`,
		children: /* @__PURE__ */ jsxs(CardContent, {
			className: "p-4 flex items-start gap-4",
			children: [
				/* @__PURE__ */ jsx("div", {
					className: "w-10 h-10 rounded-full bg-[rgba(79,122,255,0.15)] flex items-center justify-center text-sm font-bold text-[#9fc0ff] shrink-0",
					children: (acc.displayName || acc.accountId).charAt(0).toUpperCase()
				}),
				/* @__PURE__ */ jsxs("div", {
					className: "flex-1 min-w-0",
					children: [
						/* @__PURE__ */ jsxs("div", {
							className: "flex items-center gap-2 mb-1 flex-wrap",
							children: [
								/* @__PURE__ */ jsx("p", {
									className: "text-sm font-medium text-[#eee] truncate",
									children: acc.displayName || acc.accountId
								}),
								/* @__PURE__ */ jsx(Badge, {
									className: ROLE_COLORS[acc.role] || "text-[10px]",
									children: ROLE_LABELS[acc.role] || acc.role
								}),
								!acc.hasSession && /* @__PURE__ */ jsxs(Fragment, { children: [/* @__PURE__ */ jsx("span", {
									className: "text-[10px] px-1.5 py-0.5 rounded bg-[rgba(255,160,60,0.15)] text-[#ffa03c]",
									children: "Mất kết nối"
								}), /* @__PURE__ */ jsx(Button, {
									variant: "outline",
									size: "sm",
									className: "h-7 text-[11px] text-[#ffa03c] border-[rgba(255,160,60,0.3)]",
									onClick: () => onReconnect(acc.accountId),
									children: "Đăng nhập lại"
								})] }),
								acc.hasSession && /* @__PURE__ */ jsx(Button, {
									variant: "outline",
									size: "sm",
									className: "h-6 text-[10px] px-2 border-[rgba(255,255,255,0.1)] text-muted-foreground",
									onClick: async () => {
										try {
											await bff.restartAccount(acc.accountId);
										} catch {}
									},
									children: "↻ Restart"
								})
							]
						}),
						/* @__PURE__ */ jsx("p", {
							className: "text-[11px] text-muted-foreground",
							children: acc.phoneNumber || acc.accountId
						}),
						isExpanded && canManage && /* @__PURE__ */ jsxs("div", {
							className: "mt-3 pt-3 border-t border-[var(--border)]",
							children: [
								/* @__PURE__ */ jsx("p", {
									className: "text-[11px] font-medium text-[#eee] mb-2",
									children: "Quản lý phân quyền"
								}),
								members.length === 0 && /* @__PURE__ */ jsx("p", {
									className: "text-[11px] text-muted-foreground",
									children: "Chưa có thành viên nào"
								}),
								members.map((m) => /* @__PURE__ */ jsxs("div", {
									className: "flex items-center gap-3 py-2 border-b border-white/5",
									children: [
										/* @__PURE__ */ jsxs("div", {
											className: "flex-1 min-w-0",
											children: [/* @__PURE__ */ jsx("p", {
												className: "text-xs font-medium text-[#eee]",
												children: m.displayName
											}), /* @__PURE__ */ jsx("p", {
												className: "text-[10px] text-muted-foreground",
												children: m.email
											})]
										}),
										/* @__PURE__ */ jsxs(Select$1, {
											value: m.role,
											onValueChange: (v) => onChangeRole(m.userId, v),
											children: [/* @__PURE__ */ jsx(SelectTrigger, {
												className: "w-24 h-7 text-[11px]",
												children: /* @__PURE__ */ jsx(SelectValue, {})
											}), /* @__PURE__ */ jsxs(SelectContent, { children: [
												/* @__PURE__ */ jsx(SelectItem, {
													value: "viewer",
													children: "Viewer"
												}),
												/* @__PURE__ */ jsx(SelectItem, {
													value: "editor",
													children: "Editor"
												}),
												/* @__PURE__ */ jsx(SelectItem, {
													value: "admin",
													children: "Admin"
												}),
												/* @__PURE__ */ jsx(SelectItem, {
													value: "master",
													children: "Master"
												})
											] })]
										}),
										/* @__PURE__ */ jsx(Button, {
											variant: "ghost",
											size: "sm",
											className: "h-7 text-[11px] text-[#ff8888] hover:text-[#ff6666]",
											onClick: () => onRemoveMember(m.userId),
											children: "✕ Xóa"
										})
									]
								}, m.userId)),
								/* @__PURE__ */ jsxs("div", {
									className: "flex gap-2 mt-3",
									children: [/* @__PURE__ */ jsx(Button, {
										variant: "outline",
										size: "sm",
										className: "text-[11px] h-7",
										onClick: onAddMember,
										children: "+ Thêm người"
									}), /* @__PURE__ */ jsx(Button, {
										variant: "outline",
										size: "sm",
										className: "text-[11px] h-7 text-[#eb5757]",
										onClick: onTransferMaster,
										children: "Chuyển quyền Master"
									})]
								})
							]
						})
					]
				}),
				/* @__PURE__ */ jsxs("div", {
					className: "flex items-center gap-2 shrink-0",
					children: [/* @__PURE__ */ jsxs("div", {
						className: "flex items-center gap-1.5",
						title: acc.visible ? "Hiển thị trên sidebar" : "Ẩn khỏi sidebar",
						children: [/* @__PURE__ */ jsx(Switch$1, {
							checked: acc.visible,
							onCheckedChange: () => onToggleVisible(acc),
							className: "data-[state=checked]:bg-[#4f7aff]"
						}), /* @__PURE__ */ jsx("span", {
							className: "text-[10px] text-muted-foreground w-8",
							children: acc.visible ? "Hiện" : "Ẩn"
						})]
					}), canManage && /* @__PURE__ */ jsx(Button, {
						variant: "ghost",
						size: "sm",
						className: "text-[11px] h-7 shrink-0",
						onClick: () => isExpanded ? onDeselect() : onManage(acc),
						children: isExpanded ? "Đóng" : "Quản lý"
					})]
				})
			]
		})
	});
}
//#endregion
//#region src/features/admin/AdminUsersTab.tsx
function AdminUsersTab({ users, accounts, onRefresh, setError, setStatus }) {
	const [editUser, setEditUser] = useState(null);
	const [showAdd, setShowAdd] = useState(false);
	const [form, setForm] = useState({
		email: "",
		password: "",
		displayName: "",
		role: "user",
		type: "human"
	});
	const handleRoleChange = async (userId, role) => {
		try {
			await bff.adminUpdateUser(userId, { role });
			onRefresh();
			setStatus("Cap nhat role thanh cong");
		} catch (err) {
			setError(err instanceof Error ? err.message : "Loi cap nhat role");
		}
	};
	const handleDelete = async (userId) => {
		if (!confirm("Xoa nguoi dung nay?")) return;
		try {
			await bff.adminDeleteUser(userId);
			onRefresh();
			setStatus("Xoa thanh cong");
		} catch (err) {
			setError(err instanceof Error ? err.message : "Xoa that bai");
		}
	};
	const handleEditSubmit = async (e) => {
		e.preventDefault();
		if (!editUser) return;
		try {
			const updates = {};
			if (form.displayName !== editUser.displayName) updates.displayName = form.displayName;
			if (form.role !== (editUser.role || "user")) updates.role = form.role;
			if (form.type !== editUser.type) updates.type = form.type;
			if (form.password) updates.password = form.password;
			if (Object.keys(updates).length === 0) {
				setEditUser(null);
				return;
			}
			await bff.adminUpdateUser(editUser.id, updates);
			setEditUser(null);
			onRefresh();
			setStatus("Cap nhat nguoi dung thanh cong");
		} catch (err) {
			setError(err instanceof Error ? err.message : "Cap nhat that bai");
		}
	};
	const handleAddSubmit = async (e) => {
		e.preventDefault();
		if (!form.email || !form.password || !form.displayName) return;
		try {
			await bff.adminCreateUser(form.email, form.password, form.displayName);
			setShowAdd(false);
			setForm({
				email: "",
				password: "",
				displayName: "",
				role: "user",
				type: "human"
			});
			onRefresh();
			setStatus("Tao nguoi dung thanh cong");
		} catch (err) {
			setError(err instanceof Error ? err.message : "Tao that bai");
		}
	};
	const openEdit = (u) => {
		setEditUser(u);
		setForm({
			email: u.email,
			password: "",
			displayName: u.displayName,
			role: u.role || "user",
			type: u.type
		});
	};
	return /* @__PURE__ */ jsxs("div", {
		className: "flex flex-col gap-4",
		children: [
			/* @__PURE__ */ jsxs("div", {
				className: "flex items-center justify-between",
				children: [/* @__PURE__ */ jsxs("h2", {
					className: "text-base font-bold text-[#eee]",
					children: [
						"Người dùng (",
						users.length,
						")"
					]
				}), /* @__PURE__ */ jsx(Button, {
					size: "sm",
					onClick: () => {
						setShowAdd(true);
						setForm({
							email: "",
							password: "",
							displayName: "",
							role: "user",
							type: "human"
						});
					},
					children: "+ Thêm người dùng"
				})]
			}),
			/* @__PURE__ */ jsx("div", {
				className: "overflow-x-auto",
				children: /* @__PURE__ */ jsxs("table", {
					className: "w-full text-sm",
					children: [/* @__PURE__ */ jsx("thead", { children: /* @__PURE__ */ jsxs("tr", {
						className: "border-b border-white/8 text-left text-xs text-muted-foreground",
						children: [
							/* @__PURE__ */ jsx("th", {
								className: "pb-2 pr-4",
								children: "Tên hiển thị"
							}),
							/* @__PURE__ */ jsx("th", {
								className: "pb-2 pr-4",
								children: "Email"
							}),
							/* @__PURE__ */ jsx("th", {
								className: "pb-2 pr-4",
								children: "System Role"
							}),
							/* @__PURE__ */ jsx("th", {
								className: "pb-2 pr-4",
								children: "Type"
							}),
							/* @__PURE__ */ jsx("th", {
								className: "pb-2 pr-4",
								children: "Zalo Accounts"
							}),
							/* @__PURE__ */ jsx("th", { className: "pb-2" })
						]
					}) }), /* @__PURE__ */ jsx("tbody", { children: users.map((u) => /* @__PURE__ */ jsxs("tr", {
						className: "border-b border-white/4 hover:bg-white/[0.02]",
						children: [
							/* @__PURE__ */ jsx("td", {
								className: "py-2.5 pr-4 text-[#eee]",
								children: u.displayName
							}),
							/* @__PURE__ */ jsx("td", {
								className: "py-2.5 pr-4 text-[#999]",
								children: u.email
							}),
							/* @__PURE__ */ jsx("td", {
								className: "py-2.5 pr-4",
								children: /* @__PURE__ */ jsxs(Select$1, {
									value: u.role || "user",
									onValueChange: (v) => handleRoleChange(u.id, v),
									children: [/* @__PURE__ */ jsx(SelectTrigger, {
										className: "h-7 w-24 text-xs",
										children: /* @__PURE__ */ jsx(SelectValue, {})
									}), /* @__PURE__ */ jsxs(SelectContent, { children: [/* @__PURE__ */ jsx(SelectItem, {
										value: "admin",
										children: "admin"
									}), /* @__PURE__ */ jsx(SelectItem, {
										value: "user",
										children: "user"
									})] })]
								})
							}),
							/* @__PURE__ */ jsx("td", {
								className: "py-2.5 pr-4",
								children: /* @__PURE__ */ jsx(Badge, {
									variant: "secondary",
									className: "text-[10px]",
									children: u.type
								})
							}),
							/* @__PURE__ */ jsx("td", {
								className: "py-2.5 pr-4",
								children: /* @__PURE__ */ jsxs("span", {
									className: "text-[#7fa8ff] text-xs",
									children: [u.memberships?.length || 0, " accounts"]
								})
							}),
							/* @__PURE__ */ jsxs("td", {
								className: "py-2.5 flex gap-1",
								children: [/* @__PURE__ */ jsx(Button, {
									variant: "ghost",
									size: "sm",
									className: "h-7 text-xs",
									onClick: () => openEdit(u),
									children: "✏️"
								}), /* @__PURE__ */ jsx(Button, {
									variant: "ghost",
									size: "sm",
									className: "h-7 text-xs text-[#ff8888]",
									onClick: () => handleDelete(u.id),
									children: "🗑️"
								})]
							})
						]
					}, u.id)) })]
				})
			}),
			/* @__PURE__ */ jsx(Dialog$1, {
				open: !!editUser,
				onOpenChange: () => setEditUser(null),
				children: /* @__PURE__ */ jsxs(DialogContent, {
					className: "bg-[#13181f] border-[var(--border)] max-w-sm",
					children: [/* @__PURE__ */ jsx(DialogHeader, { children: /* @__PURE__ */ jsx(DialogTitle, { children: "Sửa người dùng" }) }), /* @__PURE__ */ jsxs("form", {
						onSubmit: handleEditSubmit,
						className: "flex flex-col gap-3",
						children: [
							/* @__PURE__ */ jsxs("div", {
								className: "flex flex-col gap-1",
								children: [/* @__PURE__ */ jsx(Label$1, {
									className: "text-xs",
									children: "Tên hiển thị"
								}), /* @__PURE__ */ jsx(Input, {
									value: form.displayName,
									onChange: (e) => setForm({
										...form,
										displayName: e.target.value
									}),
									className: "h-9"
								})]
							}),
							/* @__PURE__ */ jsxs("div", {
								className: "flex flex-col gap-1",
								children: [/* @__PURE__ */ jsx(Label$1, {
									className: "text-xs",
									children: "System Role"
								}), /* @__PURE__ */ jsxs(Select$1, {
									value: form.role,
									onValueChange: (v) => setForm({
										...form,
										role: v
									}),
									children: [/* @__PURE__ */ jsx(SelectTrigger, {
										className: "h-9",
										children: /* @__PURE__ */ jsx(SelectValue, {})
									}), /* @__PURE__ */ jsxs(SelectContent, { children: [/* @__PURE__ */ jsx(SelectItem, {
										value: "admin",
										children: "admin"
									}), /* @__PURE__ */ jsx(SelectItem, {
										value: "user",
										children: "user"
									})] })]
								})]
							}),
							/* @__PURE__ */ jsxs("div", {
								className: "flex flex-col gap-1",
								children: [/* @__PURE__ */ jsx(Label$1, {
									className: "text-xs",
									children: "Type"
								}), /* @__PURE__ */ jsxs(Select$1, {
									value: form.type,
									onValueChange: (v) => setForm({
										...form,
										type: v
									}),
									children: [/* @__PURE__ */ jsx(SelectTrigger, {
										className: "h-9",
										children: /* @__PURE__ */ jsx(SelectValue, {})
									}), /* @__PURE__ */ jsxs(SelectContent, { children: [/* @__PURE__ */ jsx(SelectItem, {
										value: "human",
										children: "human"
									}), /* @__PURE__ */ jsx(SelectItem, {
										value: "ai_bot",
										children: "ai_bot"
									})] })]
								})]
							}),
							/* @__PURE__ */ jsxs("div", {
								className: "flex flex-col gap-1",
								children: [/* @__PURE__ */ jsx(Label$1, {
									className: "text-xs",
									children: "Mật khẩu mới (để trống nếu không đổi)"
								}), /* @__PURE__ */ jsx(Input, {
									type: "password",
									value: form.password,
									onChange: (e) => setForm({
										...form,
										password: e.target.value
									}),
									className: "h-9"
								})]
							}),
							/* @__PURE__ */ jsx(DialogFooter, { children: /* @__PURE__ */ jsx(Button, {
								type: "submit",
								size: "sm",
								children: "Lưu"
							}) })
						]
					})]
				})
			}),
			/* @__PURE__ */ jsx(Dialog$1, {
				open: showAdd,
				onOpenChange: setShowAdd,
				children: /* @__PURE__ */ jsxs(DialogContent, {
					className: "bg-[#13181f] border-[var(--border)] max-w-sm",
					children: [/* @__PURE__ */ jsx(DialogHeader, { children: /* @__PURE__ */ jsx(DialogTitle, { children: "Thêm người dùng" }) }), /* @__PURE__ */ jsxs("form", {
						onSubmit: handleAddSubmit,
						className: "flex flex-col gap-3",
						children: [
							/* @__PURE__ */ jsxs("div", {
								className: "flex flex-col gap-1",
								children: [/* @__PURE__ */ jsx(Label$1, {
									className: "text-xs",
									children: "Email"
								}), /* @__PURE__ */ jsx(Input, {
									value: form.email,
									onChange: (e) => setForm({
										...form,
										email: e.target.value
									}),
									className: "h-9"
								})]
							}),
							/* @__PURE__ */ jsxs("div", {
								className: "flex flex-col gap-1",
								children: [/* @__PURE__ */ jsx(Label$1, {
									className: "text-xs",
									children: "Mật khẩu"
								}), /* @__PURE__ */ jsx(Input, {
									type: "password",
									value: form.password,
									onChange: (e) => setForm({
										...form,
										password: e.target.value
									}),
									className: "h-9"
								})]
							}),
							/* @__PURE__ */ jsxs("div", {
								className: "flex flex-col gap-1",
								children: [/* @__PURE__ */ jsx(Label$1, {
									className: "text-xs",
									children: "Tên hiển thị"
								}), /* @__PURE__ */ jsx(Input, {
									value: form.displayName,
									onChange: (e) => setForm({
										...form,
										displayName: e.target.value
									}),
									className: "h-9"
								})]
							}),
							/* @__PURE__ */ jsx(DialogFooter, { children: /* @__PURE__ */ jsx(Button, {
								type: "submit",
								size: "sm",
								children: "Thêm"
							}) })
						]
					})]
				})
			})
		]
	});
}
//#endregion
//#region src/features/admin/DifyBotsTab.tsx
function MultiSelectDropdown({ entities, selectedIds, onChange, label, placeholder }) {
	const [open, setOpen] = useState(false);
	const [search, setSearch] = useState("");
	const ref = useRef(null);
	useEffect(() => {
		const handler = (e) => {
			if (ref.current && !ref.current.contains(e.target)) setOpen(false);
		};
		document.addEventListener("mousedown", handler);
		return () => document.removeEventListener("mousedown", handler);
	}, []);
	const filtered = entities.filter((e) => {
		const q = search.toLowerCase();
		return e.name.toLowerCase().includes(q) || e.id.toLowerCase().includes(q);
	});
	const toggle = (id) => {
		if (selectedIds.includes(id)) onChange(selectedIds.filter((x) => x !== id));
		else onChange([...selectedIds, id]);
	};
	const getTypeLabel = (type) => {
		switch (type) {
			case "group": return "N";
			case "contact": return "BN";
			default: return "H";
		}
	};
	const getTypeColor = (type) => {
		switch (type) {
			case "group": return "text-[#22d3ee]";
			case "contact": return "text-[#34d399]";
			default: return "text-[#94a3b8]";
		}
	};
	const selectedEntities = entities.filter((e) => selectedIds.includes(e.id));
	return /* @__PURE__ */ jsxs("div", {
		className: "space-y-1.5",
		ref,
		children: [
			/* @__PURE__ */ jsx(Label$1, {
				className: "text-[11px]",
				children: label
			}),
			/* @__PURE__ */ jsx(Button, {
				variant: "outline",
				size: "sm",
				className: cn("w-full justify-start text-xs h-auto min-h-8 font-normal", !selectedIds.length && "text-muted-foreground"),
				onClick: () => setOpen(!open),
				children: selectedIds.length === 0 ? placeholder : `${selectedIds.length} đã chọn`
			}),
			selectedEntities.length > 0 && /* @__PURE__ */ jsx("div", {
				className: "flex flex-wrap gap-1 mt-1",
				children: selectedEntities.map((e) => /* @__PURE__ */ jsxs(Badge, {
					variant: "outline",
					className: "text-[10px] gap-1 pr-0.5",
					children: [
						/* @__PURE__ */ jsxs("span", {
							className: getTypeColor(e.type),
							children: [
								"[",
								getTypeLabel(e.type),
								"]"
							]
						}),
						/* @__PURE__ */ jsx("span", {
							className: "max-w-[120px] truncate",
							children: e.name
						}),
						/* @__PURE__ */ jsx("button", {
							className: "ml-0.5 hover:text-[#ff8888]",
							onClick: () => toggle(e.id),
							children: "✕"
						})
					]
				}, e.id))
			}),
			open && /* @__PURE__ */ jsxs("div", {
				className: "absolute z-50 mt-1 w-[400px] max-h-[300px] overflow-hidden border border-[var(--border)] bg-[#0d1015] rounded-md shadow-lg",
				children: [/* @__PURE__ */ jsx("div", {
					className: "p-1.5 border-b border-[var(--border)]",
					children: /* @__PURE__ */ jsx(Input, {
						value: search,
						onChange: (e) => setSearch(e.target.value),
						placeholder: "Tìm kiếm...",
						className: "text-xs h-7 border-0 focus-visible:ring-0",
						autoFocus: true
					})
				}), /* @__PURE__ */ jsxs("div", {
					className: "max-h-[240px] overflow-y-auto",
					children: [filtered.length === 0 && /* @__PURE__ */ jsx("p", {
						className: "text-xs text-muted-foreground p-2",
						children: search ? "Không tìm thấy" : "Không có dữ liệu. Hãy chọn tài khoản Zalo trước."
					}), filtered.map((e) => {
						const checked = selectedIds.includes(e.id);
						return /* @__PURE__ */ jsxs("button", {
							className: cn("w-full text-left px-2 py-1.5 flex items-center gap-2 text-xs hover:bg-[#1e293b] cursor-pointer", checked && "bg-[#1e293b]"),
							onClick: () => toggle(e.id),
							children: [
								/* @__PURE__ */ jsx("span", {
									className: cn("w-3.5 h-3.5 rounded border border-[var(--border)] flex items-center justify-center text-[9px]", checked && "bg-[#fbbf24] border-[#fbbf24] text-black"),
									children: checked ? "✓" : ""
								}),
								/* @__PURE__ */ jsxs("span", {
									className: cn("font-mono text-[10px] min-w-[36px]", getTypeColor(e.type)),
									children: [
										"[",
										getTypeLabel(e.type),
										"]"
									]
								}),
								/* @__PURE__ */ jsx("span", {
									className: "truncate",
									children: e.name
								}),
								/* @__PURE__ */ jsx("span", {
									className: "text-[10px] text-muted-foreground ml-auto truncate max-w-[100px]",
									children: e.id
								})
							]
						}, e.id);
					})]
				})]
			})
		]
	});
}
function DifyBotsTab({ setError, setStatus }) {
	const [bots, setBots] = useState([]);
	const [accounts, setAccounts] = useState([]);
	const [loading, setLoading] = useState(true);
	const [showForm, setShowForm] = useState(false);
	const [editingBot, setEditingBot] = useState(null);
	const [formName, setFormName] = useState("");
	const [formAccountId, setFormAccountId] = useState("");
	const [formApiKey, setFormApiKey] = useState("");
	const [formWebhookUrl, setFormWebhookUrl] = useState("");
	const [formEnabled, setFormEnabled] = useState(true);
	const [formReceiveGroups, setFormReceiveGroups] = useState([]);
	const [formSendGroups, setFormSendGroups] = useState([]);
	const [saving, setSaving] = useState(false);
	const [entities, setEntities] = useState([]);
	const [entitiesLoaded, setEntitiesLoaded] = useState(false);
	const [loadingEntities, setLoadingEntities] = useState(false);
	const [entityNames, setEntityNames] = useState({});
	const loadBots = async () => {
		try {
			setBots((await bff.adminBots()).bots);
		} catch (err) {
			setError(err instanceof Error ? err.message : "Failed to load bots");
		} finally {
			setLoading(false);
		}
	};
	const loadAccounts = async () => {
		try {
			setAccounts((await bff.accounts()).accounts);
		} catch {}
	};
	useEffect(() => {
		loadBots();
		loadAccounts();
	}, []);
	const loadEntities = useCallback(async (accountId) => {
		if (!accountId) {
			setEntities([]);
			setEntitiesLoaded(false);
			return;
		}
		setLoadingEntities(true);
		setEntitiesLoaded(false);
		try {
			const data = await bff.adminAccountEntities(accountId);
			setEntities(data.entities);
			setEntitiesLoaded(true);
			const nameMap = {};
			for (const e of data.entities) if (!nameMap[e.id]) nameMap[e.id] = e.name;
			setEntityNames((prev) => ({
				...prev,
				...nameMap
			}));
		} catch (err) {
			setError(err instanceof Error ? err.message : "Lỗi tải danh sách group/contact");
			setEntitiesLoaded(false);
		} finally {
			setLoadingEntities(false);
		}
	}, [setError]);
	const handleAccountChange = (accountId) => {
		setFormAccountId(accountId);
		setFormReceiveGroups([]);
		setFormSendGroups([]);
		loadEntities(accountId);
	};
	const resetForm = () => {
		setFormName("");
		setFormAccountId("");
		setFormApiKey("");
		setFormWebhookUrl("");
		setFormEnabled(true);
		setFormReceiveGroups([]);
		setFormSendGroups([]);
		setEditingBot(null);
		setEntities([]);
		setEntitiesLoaded(false);
	};
	const openEdit = (bot) => {
		setEditingBot(bot);
		setFormName(bot.name);
		setFormAccountId(bot.account_id);
		setFormApiKey(bot.dify_api_key);
		setFormWebhookUrl(bot.dify_webhook_url);
		setFormEnabled(bot.enabled);
		setFormReceiveGroups(Array.isArray(bot.receive_groups) ? bot.receive_groups : []);
		setFormSendGroups(Array.isArray(bot.send_groups) ? bot.send_groups : []);
		loadEntities(bot.account_id);
		setShowForm(true);
	};
	const handleSubmit = async () => {
		if (!formName.trim() || !formAccountId || !formWebhookUrl.trim()) {
			setError("Vui lòng điền đầy đủ các trường bắt buộc");
			return;
		}
		setSaving(true);
		setError("");
		try {
			const payload = {
				name: formName.trim(),
				account_id: formAccountId,
				dify_api_key: formApiKey.trim(),
				dify_webhook_url: formWebhookUrl.trim(),
				enabled: formEnabled,
				receive_groups: formReceiveGroups,
				send_groups: formSendGroups
			};
			if (editingBot) {
				await bff.adminBotUpdate(editingBot.id, payload);
				setStatus("Đã cập nhật bot");
			} else {
				await bff.adminBotCreate(payload);
				setStatus("Đã tạo bot mới");
			}
			resetForm();
			setShowForm(false);
			loadBots();
		} catch (err) {
			setError(err instanceof Error ? err.message : "Lỗi khi lưu bot");
		} finally {
			setSaving(false);
		}
	};
	const handleDelete = async (id, name) => {
		if (!confirm(`Xóa bot "${name}"?`)) return;
		try {
			await bff.adminBotDelete(id);
			setStatus(`Đã xóa bot "${name}"`);
			loadBots();
		} catch (err) {
			setError(err instanceof Error ? err.message : "Lỗi khi xóa bot");
		}
	};
	const handleToggleEnabled = async (bot) => {
		try {
			await bff.adminBotUpdate(bot.id, { enabled: !bot.enabled });
			setBots(bots.map((b) => b.id === bot.id ? {
				...b,
				enabled: !b.enabled
			} : b));
			setStatus(`Bot "${bot.name}" đã ${!bot.enabled ? "bật" : "tắt"}`);
		} catch (err) {
			setError(err instanceof Error ? err.message : "Lỗi khi chuyển trạng thái");
		}
	};
	const renderGroupTag = (id) => {
		const name = entityNames[id];
		return /* @__PURE__ */ jsx(Badge, {
			variant: "outline",
			className: "text-[10px] font-mono",
			children: name ? name : id.replace("group:", "")
		}, id);
	};
	useEffect(() => {
		[...new Set(bots.map((b) => b.account_id))].forEach((accountId) => {
			if (accountId && !entityNames[accountId + "__loaded"]) {
				setEntityNames((prev) => ({
					...prev,
					[accountId + "__loaded"]: "1"
				}));
				bff.adminAccountEntities(accountId).then((data) => {
					const nameMap = {};
					for (const e of data.entities) if (!nameMap[e.id]) nameMap[e.id] = e.name;
					setEntityNames((prev) => ({
						...prev,
						...nameMap
					}));
				}).catch(() => {});
			}
		});
	}, [bots.length]);
	if (loading) return /* @__PURE__ */ jsx("div", {
		className: "text-sm text-muted-foreground p-4",
		children: "Đang tải..."
	});
	return /* @__PURE__ */ jsxs("div", { children: [
		/* @__PURE__ */ jsxs("div", {
			className: "flex items-center justify-between mb-4",
			children: [/* @__PURE__ */ jsx("h2", {
				className: "text-sm font-bold text-[#eee]",
				children: "🤖 Dify Bots"
			}), /* @__PURE__ */ jsx(Button, {
				size: "sm",
				onClick: () => {
					resetForm();
					setShowForm(true);
				},
				className: "text-xs",
				children: "+ Tạo Bot"
			})]
		}),
		bots.length === 0 && !showForm && /* @__PURE__ */ jsx("p", {
			className: "text-xs text-muted-foreground",
			children: "Chưa có bot nào. Tạo bot đầu tiên để kết nối Dify."
		}),
		/* @__PURE__ */ jsx("div", {
			className: "grid grid-cols-1 gap-3",
			children: bots.map((bot) => {
				const account = accounts.find((a) => a.accountId === bot.account_id);
				const receiveGroups = Array.isArray(bot.receive_groups) ? bot.receive_groups : [];
				const sendGroups = Array.isArray(bot.send_groups) ? bot.send_groups : [];
				return /* @__PURE__ */ jsxs(Card, {
					className: cn("border border-[var(--border)] bg-[#0d1015]", !bot.enabled && "opacity-50"),
					children: [/* @__PURE__ */ jsxs(CardHeader, {
						className: "flex flex-row items-center justify-between pb-2",
						children: [/* @__PURE__ */ jsxs("div", { children: [/* @__PURE__ */ jsx(CardTitle, {
							className: "text-sm text-[#eee]",
							children: bot.name
						}), /* @__PURE__ */ jsx("p", {
							className: "text-[11px] text-muted-foreground",
							children: account ? `${account.hubAlias || account.displayName || account.accountId}${account.phoneNumber ? ` — ${account.phoneNumber}` : ""}` : bot.account_id
						})] }), /* @__PURE__ */ jsxs("div", {
							className: "flex items-center gap-2",
							children: [/* @__PURE__ */ jsx(Badge, {
								variant: bot.enabled ? "default" : "secondary",
								className: "text-[10px]",
								children: bot.enabled ? "ON" : "OFF"
							}), /* @__PURE__ */ jsx(Switch$1, {
								checked: bot.enabled,
								onCheckedChange: () => handleToggleEnabled(bot)
							})]
						})]
					}), /* @__PURE__ */ jsxs(CardContent, { children: [/* @__PURE__ */ jsxs("div", {
						className: "grid grid-cols-1 gap-1.5 text-[11px] text-muted-foreground",
						children: [
							/* @__PURE__ */ jsxs("p", { children: ["Webhook: ", /* @__PURE__ */ jsx("span", {
								className: "text-[#aaa] font-mono text-[10px]",
								children: bot.dify_webhook_url
							})] }),
							/* @__PURE__ */ jsxs("p", { children: [
								"Token: ",
								/* @__PURE__ */ jsx("code", {
									className: "text-[#aaa] font-mono text-[10px] select-all",
									children: bot.bot_token
								}),
								/* @__PURE__ */ jsx(Button, {
									variant: "ghost",
									size: "sm",
									className: "text-[10px] h-5 px-1 ml-1",
									onClick: () => {
										navigator.clipboard.writeText(bot.bot_token);
										setStatus("Đã copy token");
									},
									children: "📋"
								})
							] }),
							receiveGroups.length > 0 && /* @__PURE__ */ jsxs("div", { children: [
								/* @__PURE__ */ jsx("span", {
									className: "text-[#22d3ee]",
									children: "Receive:"
								}),
								" ",
								/* @__PURE__ */ jsx("div", {
									className: "inline-flex flex-wrap gap-1 ml-1 align-middle",
									children: receiveGroups.map(renderGroupTag)
								})
							] }),
							sendGroups.length > 0 && /* @__PURE__ */ jsxs("div", { children: [
								/* @__PURE__ */ jsx("span", {
									className: "text-[#22d3ee]",
									children: "Send:"
								}),
								" ",
								/* @__PURE__ */ jsx("div", {
									className: "inline-flex flex-wrap gap-1 ml-1 align-middle",
									children: sendGroups.map(renderGroupTag)
								})
							] }),
							receiveGroups.length === 0 && sendGroups.length === 0 && /* @__PURE__ */ jsxs("p", { children: ["Whitelist: ", /* @__PURE__ */ jsx("span", {
								className: "text-muted-foreground text-[10px]",
								children: "(tất cả group)"
							})] }),
							/* @__PURE__ */ jsxs("p", { children: ["Cập nhật: ", new Date(bot.updated_at).toLocaleString("vi-VN")] })
						]
					}), /* @__PURE__ */ jsxs("div", {
						className: "flex gap-2 mt-3",
						children: [/* @__PURE__ */ jsx(Button, {
							variant: "ghost",
							size: "sm",
							className: "text-xs h-7",
							onClick: () => openEdit(bot),
							children: "Sửa"
						}), /* @__PURE__ */ jsx(Button, {
							variant: "ghost",
							size: "sm",
							className: "text-xs h-7 text-[#ff8888] hover:text-[#ff6666]",
							onClick: () => handleDelete(bot.id, bot.name),
							children: "Xóa"
						})]
					})] })]
				}, bot.id);
			})
		}),
		/* @__PURE__ */ jsx(Dialog$1, {
			open: showForm,
			onOpenChange: (open) => {
				if (!open) {
					resetForm();
					setShowForm(false);
				}
			},
			children: /* @__PURE__ */ jsxs(DialogContent, {
				className: "sm:max-w-2xl max-h-[90vh] overflow-y-auto border-[var(--border)] bg-[#0d1015]",
				children: [
					/* @__PURE__ */ jsx(DialogHeader, { children: /* @__PURE__ */ jsx(DialogTitle, {
						className: "text-sm text-[#eee]",
						children: editingBot ? `Sửa bot: ${editingBot.name}` : "Tạo Bot Dify mới"
					}) }),
					/* @__PURE__ */ jsxs("div", {
						className: "grid grid-cols-1 md:grid-cols-2 gap-4",
						children: [
							/* @__PURE__ */ jsxs("div", {
								className: "space-y-1.5",
								children: [/* @__PURE__ */ jsx(Label$1, {
									className: "text-[11px]",
									children: "Tên bot *"
								}), /* @__PURE__ */ jsx(Input, {
									value: formName,
									onChange: (e) => setFormName(e.target.value),
									placeholder: "vd: CSKH Bot",
									className: "text-xs h-8"
								})]
							}),
							/* @__PURE__ */ jsxs("div", {
								className: "space-y-1.5",
								children: [/* @__PURE__ */ jsx(Label$1, {
									className: "text-[11px]",
									children: "Tài khoản Zalo *"
								}), /* @__PURE__ */ jsxs(Select$1, {
									value: formAccountId,
									onValueChange: handleAccountChange,
									children: [/* @__PURE__ */ jsx(SelectTrigger, {
										className: "text-xs h-8",
										children: /* @__PURE__ */ jsx(SelectValue, { placeholder: "Chọn tài khoản..." })
									}), /* @__PURE__ */ jsx(SelectContent, { children: accounts.map((acc) => /* @__PURE__ */ jsxs(SelectItem, {
										value: acc.accountId,
										className: "text-xs",
										children: [acc.hubAlias || acc.displayName || acc.accountId, acc.phoneNumber ? ` — ${acc.phoneNumber}` : ""]
									}, acc.accountId)) })]
								})]
							}),
							/* @__PURE__ */ jsxs("div", {
								className: "space-y-1.5",
								children: [/* @__PURE__ */ jsx(Label$1, {
									className: "text-[11px]",
									children: "Dify API Key (tùy chọn — chỉ cần khi dùng API /v1/workflows/run)"
								}), /* @__PURE__ */ jsx(Input, {
									value: formApiKey,
									onChange: (e) => setFormApiKey(e.target.value),
									placeholder: "app-xxxxx",
									type: "password",
									className: "text-xs h-8 font-mono"
								})]
							}),
							/* @__PURE__ */ jsxs("div", {
								className: "space-y-1.5",
								children: [/* @__PURE__ */ jsx(Label$1, {
									className: "text-[11px]",
									children: "Dify Webhook URL *"
								}), /* @__PURE__ */ jsx(Input, {
									value: formWebhookUrl,
									onChange: (e) => setFormWebhookUrl(e.target.value),
									placeholder: "https://dify.example.com/v1/webhook/...",
									className: "text-xs h-8 font-mono"
								})]
							}),
							/* @__PURE__ */ jsxs("div", {
								className: "space-y-1.5 md:col-span-2 border-t border-[var(--border)] pt-4 mt-2",
								children: [
									/* @__PURE__ */ jsx(Label$1, {
										className: "text-[12px] text-[#fbbf24]",
										children: "Conversation Whitelist"
									}),
									!formAccountId && /* @__PURE__ */ jsx("p", {
										className: "text-[10px] text-muted-foreground",
										children: "Chọn tài khoản Zalo trước để tải danh sách group/contact."
									}),
									loadingEntities && /* @__PURE__ */ jsx("p", {
										className: "text-[10px] text-muted-foreground",
										children: "Đang tải danh sách..."
									})
								]
							}),
							entitiesLoaded && /* @__PURE__ */ jsxs(Fragment, { children: [/* @__PURE__ */ jsx("div", {
								className: "relative",
								children: /* @__PURE__ */ jsx(MultiSelectDropdown, {
									entities,
									selectedIds: formReceiveGroups,
									onChange: setFormReceiveGroups,
									label: "Receive Groups (chỉ nhận webhook từ các group này)",
									placeholder: "Để trống = tất cả group"
								})
							}), /* @__PURE__ */ jsx("div", {
								className: "relative",
								children: /* @__PURE__ */ jsx(MultiSelectDropdown, {
									entities,
									selectedIds: formSendGroups,
									onChange: setFormSendGroups,
									label: "Send Groups (chỉ gửi reply vào các group này)",
									placeholder: "Để trống = tất cả group"
								})
							})] }),
							/* @__PURE__ */ jsxs("div", {
								className: "flex items-center gap-3 pt-6",
								children: [/* @__PURE__ */ jsx(Switch$1, {
									checked: formEnabled,
									onCheckedChange: setFormEnabled
								}), /* @__PURE__ */ jsx(Label$1, {
									className: "text-[11px]",
									children: formEnabled ? "Đang bật" : "Đã tắt"
								})]
							})
						]
					}),
					/* @__PURE__ */ jsxs("div", {
						className: "flex gap-2 mt-6",
						children: [/* @__PURE__ */ jsx(Button, {
							size: "sm",
							onClick: handleSubmit,
							disabled: saving,
							className: "text-xs",
							children: saving ? "Đang lưu..." : editingBot ? "Cập nhật" : "Tạo Bot"
						}), /* @__PURE__ */ jsx(Button, {
							variant: "ghost",
							size: "sm",
							onClick: () => {
								resetForm();
								setShowForm(false);
							},
							className: "text-xs",
							children: "Hủy"
						})]
					})
				]
			})
		})
	] });
}
//#endregion
//#region src/features/admin/AdminPage.tsx
function AdminPage() {
	const { user, logout } = useAuthStore();
	const navigate = useNavigate();
	const [activeTab, setActiveTab] = useState("myaccounts");
	const [users, setUsers] = useState([]);
	const [accounts, setAccounts] = useState([]);
	const [status, setStatus] = useState("");
	const [error, setError] = useState("");
	const isSuperAdmin = user?.role === "super_admin" || user?.role === "admin";
	const loadData = async () => {
		try {
			const [u, a] = await Promise.all([bff.adminUsers(), bff.accounts()]);
			setUsers(u.users);
			setAccounts(a.accounts);
		} catch {}
	};
	useEffect(() => {
		if (isSuperAdmin) loadData();
	}, [isSuperAdmin]);
	const tabs = [{
		key: "myaccounts",
		label: "Tài khoản của tôi",
		icon: "📱"
	}];
	if (isSuperAdmin) tabs.push({
		key: "users",
		label: "Người dùng",
		icon: "👤"
	}, {
		key: "allaccounts",
		label: "Tất cả Accounts",
		icon: "🔐"
	}, {
		key: "difybots",
		label: "Dify Bots",
		icon: "🤖"
	});
	return /* @__PURE__ */ jsxs("div", {
		className: "flex-1 flex min-h-screen bg-[#0f1117]",
		children: [/* @__PURE__ */ jsxs("div", {
			className: "w-[220px] min-w-[200px] border-r border-[var(--border)] flex flex-col bg-[#0d1015]",
			children: [
				/* @__PURE__ */ jsxs("div", {
					className: "px-4 py-4 border-b border-[var(--border)]",
					children: [
						/* @__PURE__ */ jsx("h1", {
							className: "text-sm font-bold text-[#eee]",
							children: "Quản trị"
						}),
						/* @__PURE__ */ jsx("p", {
							className: "text-[11px] text-muted-foreground truncate",
							children: user?.email
						}),
						/* @__PURE__ */ jsx(Badge, {
							variant: isSuperAdmin ? "default" : "secondary",
							className: "text-[10px]",
							children: user?.role || "user"
						})
					]
				}),
				/* @__PURE__ */ jsx("nav", {
					className: "flex-1 p-3 flex flex-col gap-1",
					children: tabs.map((tab) => /* @__PURE__ */ jsxs("button", {
						onClick: () => {
							setActiveTab(tab.key);
							setError("");
							setStatus("");
						},
						className: cn("flex items-center gap-2.5 px-3 py-2 rounded-md text-xs transition-colors text-left", activeTab === tab.key ? "bg-[rgba(79,122,255,0.15)] text-[#9fc0ff] font-medium" : "text-muted-foreground hover:text-[#ccc] hover:bg-white/[0.04]"),
						children: [/* @__PURE__ */ jsx("span", {
							className: "text-sm",
							children: tab.icon
						}), tab.label]
					}, tab.key))
				}),
				/* @__PURE__ */ jsxs("div", {
					className: "p-3 border-t border-[var(--border)] flex flex-col gap-2",
					children: [/* @__PURE__ */ jsx(Button, {
						variant: "ghost",
						size: "sm",
						className: "text-xs justify-start",
						onClick: () => navigate("/"),
						children: "← Dashboard"
					}), /* @__PURE__ */ jsx(Button, {
						variant: "ghost",
						size: "sm",
						className: "text-xs justify-start text-[#ff8888]",
						onClick: () => {
							logout();
							navigate("/login");
						},
						children: "Đăng xuất"
					})]
				})
			]
		}), /* @__PURE__ */ jsxs("div", {
			className: "flex-1 flex flex-col min-w-0",
			children: [(status || error) && /* @__PURE__ */ jsx("div", {
				className: `shrink-0 px-5 py-2.5 text-[13px] ${error ? "bg-[rgba(255,80,80,0.1)] text-[#ff9a9a]" : "bg-[rgba(60,200,120,0.1)] text-[#6fe0a0]"}`,
				children: error || status
			}), /* @__PURE__ */ jsxs("div", {
				className: "flex-1 p-6 overflow-y-auto",
				children: [
					activeTab === "myaccounts" && /* @__PURE__ */ jsx(MyAccountsTab, {
						setError,
						setStatus
					}),
					activeTab === "users" && isSuperAdmin && /* @__PURE__ */ jsx(AdminUsersTab, {
						users,
						accounts,
						onRefresh: loadData,
						setError,
						setStatus
					}),
					activeTab === "allaccounts" && isSuperAdmin && /* @__PURE__ */ jsx(SuperAdminAccountsTab, {
						accounts,
						onRefresh: loadData,
						setError,
						setStatus
					}),
					activeTab === "difybots" && isSuperAdmin && /* @__PURE__ */ jsx(DifyBotsTab, {
						setError,
						setStatus
					})
				]
			})]
		})]
	});
}
function SuperAdminAccountsTab({ accounts, onRefresh, setError, setStatus }) {
	const [allAccounts, setAllAccounts] = useState([]);
	useEffect(() => {
		bff.adminAllAccounts().then((r) => setAllAccounts(r.accounts)).catch(() => {});
	}, []);
	return /* @__PURE__ */ jsxs("div", { children: [/* @__PURE__ */ jsx("h2", {
		className: "text-sm font-bold text-[#eee] mb-4",
		children: "Tất cả tài khoản Zalo"
	}), /* @__PURE__ */ jsx("div", {
		className: "grid grid-cols-1 md:grid-cols-2 gap-4",
		children: allAccounts.map((acc) => /* @__PURE__ */ jsxs("div", {
			className: "p-4 rounded-lg border border-[var(--border)] bg-[#0d1015]",
			children: [/* @__PURE__ */ jsxs("div", {
				className: "flex items-center gap-3 mb-2",
				children: [/* @__PURE__ */ jsx("div", {
					className: "w-10 h-10 rounded-full bg-[rgba(79,122,255,0.15)] flex items-center justify-center text-sm font-bold text-[#9fc0ff]",
					children: (acc.displayName || acc.accountId).charAt(0).toUpperCase()
				}), /* @__PURE__ */ jsxs("div", { children: [/* @__PURE__ */ jsx("p", {
					className: "text-sm font-medium text-[#eee]",
					children: acc.displayName || acc.accountId
				}), /* @__PURE__ */ jsx("p", {
					className: "text-[11px] text-muted-foreground",
					children: acc.accountId
				})] })]
			}), /* @__PURE__ */ jsxs("div", {
				className: "text-[11px] space-y-1 text-muted-foreground",
				children: [acc.master && /* @__PURE__ */ jsxs("p", { children: [
					"Master: ",
					acc.master.displayName,
					" (",
					acc.master.email,
					")"
				] }), /* @__PURE__ */ jsxs("p", { children: ["Thành viên: ", acc.memberCount] })]
			})]
		}, acc.accountId))
	})] });
}
//#endregion
//#region app/routes/admin.tsx
var admin_exports = /* @__PURE__ */ __exportAll({
	default: () => admin_default,
	loader: () => loader
});
async function loader({ request }) {
	const cookie = request.headers.get("cookie") || "";
	const authRes = await serverFetch("/bff/auth/me", cookie);
	if (!authRes.ok) throw redirect("/login");
	const authBody = await authRes.json();
	const [usersRes, botsRes, accountsRes] = await Promise.all([
		serverFetch("/bff/admin/users", cookie),
		serverFetch("/bff/admin/bots", cookie),
		serverFetch("/bff/admin/accounts/all", cookie)
	]);
	return {
		user: authBody?.data?.user ?? null,
		users: usersRes.ok ? (await usersRes.json()).data : null,
		bots: botsRes.ok ? (await botsRes.json()).data : null,
		accounts: accountsRes.ok ? (await accountsRes.json()).data : null
	};
}
var admin_default = UNSAFE_withComponentProps(function AdminRoute() {
	return /* @__PURE__ */ jsx(AdminPage, {});
});
//#endregion
//#region \0virtual:react-router/server-manifest
var server_manifest_default = {
	"entry": {
		"module": "/assets/entry.client-Cq6EtcQR.js",
		"imports": ["/assets/jsx-runtime-0LPVyEnC.js", "/assets/react-dom-Bnd4Ajyw.js"],
		"css": []
	},
	"routes": {
		"root": {
			"id": "root",
			"parentId": void 0,
			"path": "",
			"index": void 0,
			"caseSensitive": void 0,
			"hasAction": false,
			"hasLoader": false,
			"hasClientAction": false,
			"hasClientLoader": false,
			"hasClientMiddleware": false,
			"hasDefaultExport": true,
			"hasErrorBoundary": false,
			"module": "/assets/root-DMUlDXfc.js",
			"imports": ["/assets/jsx-runtime-0LPVyEnC.js", "/assets/react-dom-Bnd4Ajyw.js"],
			"css": [],
			"clientActionModule": void 0,
			"clientLoaderModule": void 0,
			"clientMiddlewareModule": void 0,
			"hydrateFallbackModule": void 0
		},
		"routes/_index": {
			"id": "routes/_index",
			"parentId": "root",
			"path": void 0,
			"index": true,
			"caseSensitive": void 0,
			"hasAction": false,
			"hasLoader": true,
			"hasClientAction": false,
			"hasClientLoader": false,
			"hasClientMiddleware": false,
			"hasDefaultExport": true,
			"hasErrorBoundary": false,
			"module": "/assets/_index-Dh1o3qno.js",
			"imports": [
				"/assets/jsx-runtime-0LPVyEnC.js",
				"/assets/useHydrate-C0ACoHYL.js",
				"/assets/dialog-lbKbM7TY.js",
				"/assets/auth-store-BNypa4Sy.js",
				"/assets/react-dom-Bnd4Ajyw.js"
			],
			"css": [],
			"clientActionModule": void 0,
			"clientLoaderModule": void 0,
			"clientMiddlewareModule": void 0,
			"hydrateFallbackModule": void 0
		},
		"routes/login": {
			"id": "routes/login",
			"parentId": "root",
			"path": "login",
			"index": void 0,
			"caseSensitive": void 0,
			"hasAction": false,
			"hasLoader": true,
			"hasClientAction": false,
			"hasClientLoader": false,
			"hasClientMiddleware": false,
			"hasDefaultExport": true,
			"hasErrorBoundary": false,
			"module": "/assets/login-B1FUMo2N.js",
			"imports": [
				"/assets/jsx-runtime-0LPVyEnC.js",
				"/assets/auth-store-BNypa4Sy.js",
				"/assets/card-DeBJAw6U.js",
				"/assets/react-dom-Bnd4Ajyw.js"
			],
			"css": [],
			"clientActionModule": void 0,
			"clientLoaderModule": void 0,
			"clientMiddlewareModule": void 0,
			"hydrateFallbackModule": void 0
		},
		"routes/m": {
			"id": "routes/m",
			"parentId": "root",
			"path": "m",
			"index": void 0,
			"caseSensitive": void 0,
			"hasAction": false,
			"hasLoader": true,
			"hasClientAction": false,
			"hasClientLoader": false,
			"hasClientMiddleware": false,
			"hasDefaultExport": true,
			"hasErrorBoundary": false,
			"module": "/assets/m-CY_NfozS.js",
			"imports": [
				"/assets/jsx-runtime-0LPVyEnC.js",
				"/assets/useHydrate-C0ACoHYL.js",
				"/assets/dialog-lbKbM7TY.js",
				"/assets/auth-store-BNypa4Sy.js",
				"/assets/react-dom-Bnd4Ajyw.js"
			],
			"css": [],
			"clientActionModule": void 0,
			"clientLoaderModule": void 0,
			"clientMiddlewareModule": void 0,
			"hydrateFallbackModule": void 0
		},
		"routes/admin": {
			"id": "routes/admin",
			"parentId": "root",
			"path": "admin",
			"index": void 0,
			"caseSensitive": void 0,
			"hasAction": false,
			"hasLoader": true,
			"hasClientAction": false,
			"hasClientLoader": false,
			"hasClientMiddleware": false,
			"hasDefaultExport": true,
			"hasErrorBoundary": false,
			"module": "/assets/admin-Def3J5ZL.js",
			"imports": [
				"/assets/jsx-runtime-0LPVyEnC.js",
				"/assets/dialog-lbKbM7TY.js",
				"/assets/auth-store-BNypa4Sy.js",
				"/assets/card-DeBJAw6U.js",
				"/assets/react-dom-Bnd4Ajyw.js"
			],
			"css": [],
			"clientActionModule": void 0,
			"clientLoaderModule": void 0,
			"clientMiddlewareModule": void 0,
			"hydrateFallbackModule": void 0
		}
	},
	"url": "/assets/manifest-668d9369.js",
	"version": "668d9369",
	"sri": void 0
};
//#endregion
//#region \0virtual:react-router/server-build
var assetsBuildDirectory = "build/client";
var basename = "/";
var future = {
	"unstable_optimizeDeps": false,
	"v8_passThroughRequests": false,
	"v8_trailingSlashAwareDataRequests": false,
	"unstable_previewServerPrerendering": false,
	"v8_middleware": false,
	"v8_splitRouteModules": false,
	"v8_viteEnvironmentApi": false
};
var ssr = true;
var isSpaMode = false;
var prerender = [];
var routeDiscovery = {
	"mode": "lazy",
	"manifestPath": "/__manifest"
};
var publicPath = "/";
var entry = { module: entry_server_node_exports };
var routes = {
	"root": {
		id: "root",
		parentId: void 0,
		path: "",
		index: void 0,
		caseSensitive: void 0,
		module: root_exports
	},
	"routes/_index": {
		id: "routes/_index",
		parentId: "root",
		path: void 0,
		index: true,
		caseSensitive: void 0,
		module: _index_exports
	},
	"routes/login": {
		id: "routes/login",
		parentId: "root",
		path: "login",
		index: void 0,
		caseSensitive: void 0,
		module: login_exports
	},
	"routes/m": {
		id: "routes/m",
		parentId: "root",
		path: "m",
		index: void 0,
		caseSensitive: void 0,
		module: m_exports
	},
	"routes/admin": {
		id: "routes/admin",
		parentId: "root",
		path: "admin",
		index: void 0,
		caseSensitive: void 0,
		module: admin_exports
	}
};
var allowedActionOrigins = false;
//#endregion
export { allowedActionOrigins, server_manifest_default as assets, assetsBuildDirectory, basename, entry, future, isSpaMode, prerender, publicPath, routeDiscovery, routes, ssr };
