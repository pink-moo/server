require("dotenv").config()
const WebSocket = require("ws")
const msgpack = require("msgpack-lite")
const http = require("http")
const fs = require("fs/promises")
const path = require("path")
const url = require("url")
const inquirer = require("inquirer")
const fetch = require("node-fetch")
const package = require("./package.json")

async function checkLatest() {
	const response = await fetch("https://raw.githubusercontent.com/kookywarrior/moomooio-private-server/main/package.json")
	const data = await response.json()
	return data.version === package.version
}

var MODE = process.env.MODE
var PASSWORD = process.env.PASSWORD
var PREFIX = process.env.PREFIX
const PORT = process.env.PORT || 1234
const PUBLIC_DIR = process.env.PUBLIC_DIR || "../dist/client/"
var server = new WebSocket.Server({ noServer: true })

let delta,
	now,
	lastUpdate = Date.now()
var ais = []
var players = []
var gameObjects = []
var projectiles = []
function findPlayerByID(id) {
	for (let i = 0; i < players.length; ++i) {
		if (players[i].id === id) {
			return players[i]
		}
	}
	return null
}
function findPlayerBySID(sid) {
	for (let i = 0; i < players.length; ++i) {
		if (players[i].sid === sid) {
			return players[i]
		}
	}
	return null
}
const UTILS = require("./src/utils")
let config = require("./src/config")
let GameObject = require("./src/gameObject.js")
let items = require("./src/items.js")
let ObjectManager = require("./src/objectManager.js")
let Player = require("./src/player.js")
let store = require("./src/store.js")
let Projectile = require("./src/projectile.js")
let ProjectileManager = require("./src/projectileManager.js")
let AiManager = require("./src/aiManager.js")
let AI = require("./src/ai.js")
let TribeManager = require("./src/tribeManager.js")
let Tribe = require("./src/tribe.js")
let objectManager = new ObjectManager(GameObject, gameObjects, UTILS, config, players, server)
let aiManager = new AiManager(ais, AI, players, items, objectManager, config, UTILS, scoreCallback, server)
let projectileManager = new ProjectileManager(Projectile, projectiles, players, ais, objectManager, items, config, UTILS, server)
let tribeManager = new TribeManager(Tribe, findPlayerBySID, server)
let hats = store.hats,
	accessories = store.accessories

var connection = {}
server.send = function (id, type, data = []) {
	if (connection[id]) {
		connection[id].send(new Uint8Array(Array.from(msgpack.encode([UTILS.OldToNew(type, "RECEIVE"), data]))))
	}
}
server.sendAll = function (type, data = []) {
	for (let i = 0; i < players.length; i++) {
		let tmpPlayer = players[i]
		if (tmpPlayer && tmpPlayer.joinedOnce) {
			server.send(tmpPlayer.id, type, data)
		}
	}
}

let sameIpConnections = {}

let playersSid = new Set()
server.addListener("connection", function (conn, req) {
	let ip = req.headers['x-forwarded-for']?.split(',')[0].trim() || req.headers['x-real-ip'] || req.socket.remoteAddress
	
	if ((sameIpConnections[ip] || 0) >= config.maxSameIpConnections) {
		conn.close()
		return
	}

	sameIpConnections[ip] = (sameIpConnections[ip] || 0) + 1

	do {
		conn.id = UTILS.randomString(10)
	} while(players.find(p => p.id === conn.id))

	conn.sid = 1
	while (playersSid.has(conn.sid)) {
		conn.sid++
	}
	playersSid.add(conn.sid)

	connection[conn.id] = conn
	conn.on("error", console.log)
	conn.on("close", function () {
		sameIpConnections[ip] = (sameIpConnections[ip] || 0) - 1
		let tmpPlayer = findPlayerByID(conn.id)
		if (!tmpPlayer) return
		tmpPlayer.joinedOnce = false
		if (tmpPlayer.team && MODE !== "HOCKEY") {
			if (tmpPlayer.isLeader) {
				server.sendAll("ad", [tmpPlayer.team])
				tribeManager.deleteTribe(tmpPlayer.team)
			} else {
				tribeManager.getTribe(tmpPlayer.team).removePlayer(tmpPlayer)
			}
		}
		server.sendAll("4", [conn.id])
		objectManager.removeAllItems(tmpPlayer.sid, server)
		for (let i = 0; i < players.length; ++i) {
			if (players[i].id == conn.id) {
				players.splice(i, 1)
				playersSid.delete(conn.sid)
				updateLeaderboard()
				iconCallback()
				break
			}
		}
	})

	conn.on("message", function (message) {
		let data, type
		try {
			[type, data] = msgpack.decode(new Uint8Array(message))
		} catch (e) {
			conn.close()
			return
		}

		const events = {
			0: pingSocket,
			M: enterGame,
			e: resetMoveDir,
			F: sendAtckState,
			9: sendMoveDir,
			D: sendDir,
			z: selectToBuild,
			H: sendUpgrade,
			K: sendLockGather,
			6: sendMessage,
			c: storeFunction,
			L: createAllaince,
			N: leaveAlliance,
			b: sendJoinRequest,
			P: decideJoinRequest,
			Q: kickFromClan,
			S: sendMapPing
		}
		if (events[type]) {
			// if (type !== "0")
			// 	console.log(events[type].name, data)
			try {
				events[type].apply(undefined, data)
			} catch (error) {
				console.error(error)
			}
		}
		else {
			// console.log(ip, "sent", type)
			let pl = findPlayerByID(conn.id)
			pl.shameTimer = 30000
			pl.shameCount = 0
		}

		function pingSocket() {
			server.send(conn.id, "pp")
		}

		function enterGame(data) {
			if (MODE === "HOCKEY" && config.isStarted) return
			let tmpPlayer = findPlayerByID(conn.id)
			if (tmpPlayer && !tmpPlayer.alive) {
				tmpPlayer.spawn(data.moofoll)
				tmpPlayer.visible = false
				const location = objectManager.fetchSpawnObj(tmpPlayer.sid) || [UTILS.randInt(0, config.mapScale), UTILS.randInt(0, config.mapScale)]
				tmpPlayer.setData([tmpPlayer.id, tmpPlayer.sid, UTILS.filterText(data.name, 15) || "furry lover", location[0], location[1], 0, 100, 100, config.playerScale, data.skin])
				server.send(conn.id, "1", [tmpPlayer.sid])
				updateLeaderboard()
			}
		}

		function resetMoveDir() {
			let tmpPlayer = findPlayerByID(conn.id)
			if (tmpPlayer && tmpPlayer.alive) {
				tmpPlayer.resetMoveDir()
			}
		}

		function sendAtckState(mouseState, dir) {
			let tmpPlayer = findPlayerByID(conn.id)
			if (tmpPlayer && tmpPlayer.alive) {
				if (UTILS.isNumber(dir)) {
					tmpPlayer.dir = dir
				}
				tmpPlayer.mouseState = mouseState
				if (mouseState) {
					if (tmpPlayer.buildIndex >= 0) {
						tmpPlayer.buildItem(items.list[tmpPlayer.buildIndex])
					} else {
						tmpPlayer.gathering = mouseState
					}
				}
			}
		}

		function sendMoveDir(newMoveDir) {
			let tmpPlayer = findPlayerByID(conn.id)
			if (tmpPlayer && tmpPlayer.alive) {
				tmpPlayer.moveDir = newMoveDir
			}
		}

		function sendDir(newDir) {
			let tmpPlayer = findPlayerByID(conn.id)
			if (tmpPlayer && tmpPlayer.alive) {
				let PHI = Math.PI * 2
				tmpPlayer.dir = (newDir % PHI + PHI) % PHI
			}
		}

		function selectToBuild(index, wpn) {
			if (MODE === "HOCKEY") return
			let tmpPlayer = findPlayerByID(conn.id)
			if (tmpPlayer && tmpPlayer.alive) {
				if (wpn) {
					if (isNaN(index) || !items.weapons[index] || tmpPlayer.weapons.indexOf(index) === -1) return
					tmpPlayer.buildIndex = -1
					tmpPlayer.weaponIndex = index
				} else {
					if (!tmpPlayer.items.indexOf(index) === -1 || !tmpPlayer.canBuild(items.list[index]) || tmpPlayer.buildIndex === index) {
						tmpPlayer.buildIndex = -1
					} else {
						tmpPlayer.buildIndex = index
					}
				}
				tmpPlayer.mouseState = 0
			}
		}

		function sendLockGather(type) {
			let tmpPlayer = findPlayerByID(conn.id)
			if (tmpPlayer && tmpPlayer.alive) {
				if (type === 0) {
					tmpPlayer.lockDir = !tmpPlayer.lockDir
				} else if (type === 1) {
					tmpPlayer.autoGather = !tmpPlayer.autoGather
					if (!tmpPlayer.autoGather) tmpPlayer.mouseState = 0
				}
			}
		}

		function sendMessage(message) {
			message = UTILS.filterText(message)
			if (!message) return

			function feedback(text) {
				server.send(conn.id, "ch", [tmpPlayer.sid, text])
			}

			let tmpPlayer = findPlayerByID(conn.id)
			if (!tmpPlayer || !tmpPlayer.alive) return
			if (message.startsWith(PREFIX)) {
				let args = message.slice(PREFIX.length).split(/\s+/g)
				
				switch (args[0]) {
					case "say": case "pass": {
						if (tmpPlayer.chatCooldown > 0) return
						tmpPlayer.chatCooldown = config.chatCooldown
						server.sendAll("ch", [tmpPlayer.sid, message.slice(5).toString()])
						return
					}
					case "l": case "login": {
						if (args[1] === PASSWORD) {
							tmpPlayer.admin = true
							feedback(`✔ Welcome Back`)
						}
						else {
							feedback(`✘ Wrong Password`)
						}
						return
					}
					case "c": case "clear": {
						objectManager.removeAllItems(tmpPlayer.sid, server)
						for (let i = 0; i < items.groups.length; i++) {
							tmpPlayer.changeItemAllCount(i, 0)
						}
						feedback(`✔ Cleared All Buildings`)
						return
					}
					case "v": case "variant": {
						switch (args[1]) {
							case "emerald":
								tmpPlayer.weaponXP[tmpPlayer.weaponIndex] = 20000
								break
							case "ruby":
								tmpPlayer.weaponXP[tmpPlayer.weaponIndex] = 12000
								break
							case "diamond":
								tmpPlayer.weaponXP[tmpPlayer.weaponIndex] = 7000
								break
							case "gold":
								tmpPlayer.weaponXP[tmpPlayer.weaponIndex] = 3000
								break
							case "stone": case "normal": case "default":
								tmpPlayer.weaponXP[tmpPlayer.weaponIndex] = 0
								break
							default: {
								feedback(`✘ Invalid Variant Name`)
								return
							}
						}
						feedback(`✔ Weapon Variant Set To ${UTILS.capitalizeFirst(args[1])}`)
						return
					}
					case "suicide": case "die": {
						tmpPlayer.changeHealth(tmpPlayer.maxHealth * -10, "suicide", tmpPlayer)
						feedback(`✔ Committed Suicide`)
						return
					}
					default: {
						if (!tmpPlayer.admin) {
							feedback(`✘ Unknown Command`)
							return
						}
					}
				}

				switch (args[0]) {
					case "p": case "promote": case "depromote": {
						var tmpObj = findPlayerBySID(parseInt(args[1]))
						if (tmpObj) {
							tmpObj.admin = !tmpObj.admin;	
							feedback(`✔ ${tmpObj.admin ? "P" : "Dep"}romoted ${tmpObj.name}`)
						}
						else {
							feedback(`✘ Player Not Found`)
						}
						return
					}
					case "setup": {
						for (let i = 0; i < 9; i++) {
							tmpPlayer.addResource(3, 200000 + Math.floor(Math.random() * 800000), true)
						}
						tmpPlayer.addResource(2, 200000 + Math.floor(Math.random() * 800000), true)
						tmpPlayer.addResource(1, 200000 + Math.floor(Math.random() * 800000), true)
						tmpPlayer.addResource(0, 200000 + Math.floor(Math.random() * 800000), true)
						feedback(`✔ Resources Given`)
						return
					}
					case "clown": {
						let timer = parseInt(args[1])
						tmpPlayer.shameTimer = timer * 1000 || (tmpPlayer.shameTimer > 0 ? 0 : 30000)
						tmpPlayer.shameCount = 0
						return
					}
					case "speed": {
						var speedmlt = parseFloat(args[1])
						if (UTILS.isNumber(speedmlt)) {
							tmpPlayer.speed = config.playerSpeed * speedmlt
							feedback(`✔ Speed Set To ${speedmlt}`)
						}
						else {
							feedback(`✘ Invalid Number`)
						}
						return
					}
					case "teleport": case "tp": {
						if (args[2] == null) {
							var tmpObj = findPlayerBySID(parseInt(args[1]))
							if (tmpObj) {
								tmpPlayer.x = tmpObj.x
								tmpPlayer.y = tmpObj.y
								feedback(`✔ Teleported To ${tmpObj.name}`)
							}
							else {
								feedback(`✘ Player Not Found`)
							}
						} else {
							const tmpX = args[1][0] === "~" ? tmpPlayer.x + (Number.parseInt(args[1].slice(1)) || 0) : parseInt(args[1])
							const tmpY = args[2][0] === "~" ? tmpPlayer.y + (Number.parseInt(args[2].slice(1)) || 0) : parseInt(args[2])
							if (UTILS.isNumber(tmpX) && UTILS.isNumber(tmpY)) {
								tmpPlayer.x = tmpX
								tmpPlayer.y = tmpY
								feedback(`✔ Teleported To (${tmpX}, ${tmpY})`)
							}
							else {
								feedback(`✘ Invalid Coordinate`)
							}
						}
						return
					}
					case "teleport-here": case "tph": {
						var tmpObj = findPlayerBySID(parseInt(args[1]))
						if (tmpObj) {
							tmpObj.x = tmpPlayer.x
							tmpObj.y = tmpPlayer.y
							feedback(`✔ Teleported ${tmpObj.name} to you`)
						}
						else {
							feedback(`✘ Player Not Found`)
						}
						return
					}
					case "u": case "upgrade": {
						let id = parseInt(args[1])
						if (!UTILS.isNumber(id)) {
							let str = args.slice(1).join(" ").toLowerCase().trim()
							if (str) {
								let weapon = items.weapons.findIndex(w => w.name.includes(str))
								let item = items.list.findIndex(w => w.name.includes(str))

								if (weapon >= 0) id = weapon
								if (item >= 0) id = 16 + item
							}

							if (!UTILS.isNumber(id)) {
								feedback(`✘ Invalid Item`)
								return
							}
						}

						sendUpgrade(id)
						feedback(`✔ Upgraded ${(items.weapons[id] || items.list[id - 16]).name}`)
						return
					}
					case "damage": case "dmg": {
						if (!args[1]) {
							tmpPlayer.customDmg = null
							feedback(`✔ Cleared Custom Damage`)
						} else {
							let dmg = parseFloat(args[1])
							if (UTILS.isNumber(dmg)) {
								tmpPlayer.customDmg = dmg
								feedback(`✔ Custom Damage Set To ${dmg}`)
							}
							else {
								feedback(`✘ Invalid Damage`)
							}
						}
						return
					}
					case "health": {
						if (!args[1]) {
							tmpPlayer.customDmg = 100
							feedback(`✔ Cleared Custom Health`)
						} else {
							let health = parseFloat(args[1])
							if (UTILS.isNumber(health)) {
								tmpPlayer.maxHealth = health
								feedback(`✔ Custom Health Set To ${health}`)
							}
							else {
								feedback(`✘ Invalid Damage`)
							}
						}
						return
					}
					case "invc": case "invincible": {
						tmpPlayer.invc = !tmpPlayer.invc
						tmpPlayer.shameCount = 0;
						feedback(`✔ Turned ${tmpPlayer.invc ? "On" : "Off"} Invincible Mode`)
						return
					}
					case "destroy": {
						tmpPlayer.destroyMode = !tmpPlayer.destroyMode
						feedback(`✔ Turned ${tmpPlayer.destroyMode ? "On" : "Off"} Destroy Mode`)
						return
					}
					case "no-clip": case "noclip": {
						tmpPlayer.noClip = !tmpPlayer.noClip
						feedback(`✔ Turned ${tmpPlayer.noClip ? "On" : "Off"} No Clip Mode`)
						return
					}
					case "sight": {
						tmpPlayer.trueSight = !tmpPlayer.trueSight
						feedback(`✔ Turned ${tmpPlayer.trueSight ? "On" : "Off"} True Sight Mode`)
						return
					}
					case "s": case "spawn": {
						switch (args[1]) {
							case "tree": case "stone": case "bush": case "cactus": case "gold": {
								if (args[1] == "cactus") {
									args[1] = "bush"
								}

								let idMap = {
									tree: 0,
									bush: 1,
									stone: 2,
									gold: 3
								}

								const isCactus = args[1] == "bush" && tmpPlayer.y >= config.mapScale - config.snowBiomeTop
								const size = isCactus
									? config.bushScales[2]
									: UTILS.pick([config.treeScales, config.bushScales, config.rockScales, config.rockScales][idMap[args[1]]])
								
								let overlap
								for (let i = 0; i < gameObjects.length; i++) {
									if (UTILS.getDistance(tmpPlayer.x, tmpPlayer.y, gameObjects[i].x, gameObjects[i].y) < gameObjects[i].getScale() + size) {
										overlap = true
										break
									}
								}

								// if (overlap) {
								// 	feedback(`✘ Invalid Position`)
								// }
								// else {
									let obj = objectManager.add(objectManager.objects.length, tmpPlayer.x, tmpPlayer.y, UTILS.randFloat(-Math.PI, Math.PI), size, idMap[args[1]], null, false, null)
									if (isCactus) obj.dmg = 35 
									feedback(`✔ Spawned ${UTILS.capitalizeFirst(args[1])}`)
								// }
								return
							}
							case "cow": case "pig": case "bird": case "bull": case "bully": case "wolf": case "moostafa": case "moofie": case "treasure": {
								let idMap = {
									cow: 0,
									pig: 1,
									bull: 2,
									bully: 3,
									wolf: 4,
									bird: 5,
									moostafa: 6,
									treasure: 7,
									moofie: 8
								}

								let ai = ais
									.filter(ai => ai.index == idMap[args[1]])
									.sort((a, b) => UTILS.getDistance(b.x, b.y, tmpPlayer.x, tmpPlayer.y) - UTILS.getDistance(a.x, a.y, tmpPlayer.x, tmpPlayer.y))[0]
								if (ai) {
									ai.spawnCounter = 0
									ai.x = tmpPlayer.x
									ai.y = tmpPlayer.y
									feedback(`✔ Spawned ${UTILS.capitalizeFirst(args[1])}`)
								}
								else {
									feedback(`✘ Can't Find AI To Spawn (That's Weird)`)
								}
								return
							}
							case "bot": {
								let id
								do {
									id = UTILS.randomString(10)
								} while (players.find(p => p.id === id))

								let sid = 500
								while (playersSid.has(sid)) {
									sid++
								}
								playersSid.add(sid)
								
								let bot = new Player(
									id,
									sid,
									config,
									UTILS,
									projectileManager,
									objectManager,
									players,
									ais,
									items,
									hats,
									accessories,
									server,
									() => {},
									() => {},
									MODE
								)
								bot.isBot = true
								bot.team = "✔"
								players.push(bot)
								bot.spawn(true)
								bot.setData([
									id,
									sid,
									"Bot",
									tmpPlayer.x,
									tmpPlayer.y,
									tmpPlayer.dir,
									100,
									100,
									config.playerScale,
									UTILS.randInt(0, config.skinColors.length - 1)
								])
								feedback(`✔ Spawned Bot (${sid})`)
								return
							}
							default: {
								feedback(`✘ Invalid Stuff To Spawn`)
								return
							}
						}
					}
					case "bot": {
						let botDistSq = Infinity
						let bot = null
						for (let b of players.filter(pl => pl.active && pl.alive && pl.isBot)) {
							let distSq = Math.abs(b.x - tmpPlayer.x) ** 2 + Math.abs(b.y - tmpPlayer.y) ** 2
							if (distSq <= 400 * 400 && distSq < botDistSq) {
								botDistSq = distSq
								bot = b
							}
						}
						if (!bot) {
							feedback(`✘ No Bot Found`)
							return
						}
						switch (args[1]) {
							case "t": case "toggle": {
								switch (args[2]) {
									case "heal": case "equip": case "place": case "break": case "walk": case "hit": {
										let bigName = args[2][0].toUpperCase() + args[2].slice(1)
										let key = "auto" + bigName
										bot[key] = !bot[key]
										feedback(`✔ Turned ${bot[key] ? "On" : "Off"} Bot Auto ${bigName}`)
										return
									}
									default: {
										feedback(`✘ Invalid Stuff To Toggle`)
										return
									}
								}
							}
							default: {
								feedback(`✘ Invalid Subcommand`)
								return
							}
						}
						return
					}
					case "start": { break }
					default: {
						feedback(`✘ Unknown Command`)
					}
				}
				
				if (MODE === "HOCKEY" && message === PREFIX + "start" && !config.isStarted) {
					var tmpObj = findPlayerBySID(1)
					if (tmpObj) {
						tmpObj.spawn(false)
						tmpObj.visible = false
						tmpObj.setData([
							tmpObj.id,
							tmpObj.sid,
							" ",
							(3000 + 43 + (40 - 2) * 43 * 2 + (3000 + 43)) / 2,
							(3000 + 43 + (20 - 2) * 43 * 2 + (3000 + 43)) / 2,
							Math.PI / 2,
							0,
							100,
							config.playerScale,
							4
						])
						tmpObj.weaponIndex = 11
						const teams = UTILS.randTeam(players.slice(1), (players.length - 1) / 2)
						Array.from(teams[0]).forEach((tmpppl) => {
							if (tmpppl) {
								tmpppl.team = "Team 1"
								tmpppl.x = 3000 + 43
								tmpppl.y = UTILS.randFloat(3000 + 43, 3000 + 43 + (20 - 2) * 43 * 2)
							}
						})
						if (teams[1]) {
							Array.from(teams[1]).forEach((tmpppl) => {
								if (tmpppl) {
									tmpppl.team = "Team 2"
									tmpppl.x = 3000 + 43 + (40 - 2) * 43 * 2
									tmpppl.y = UTILS.randFloat(3000 + 43, 3000 + 43 + (20 - 2) * 43 * 2)
								}
							})
						}
						config.isStarted = true
						feedback(`✔ Game Started`)
					}
				}
			} else {
				if (tmpPlayer.chatCooldown > 0) return
				tmpPlayer.chatCooldown = config.chatCooldown
				server.sendAll("ch", [tmpPlayer.sid, message.toString()])
			}
		}

		function sendUpgrade(index) {
			if (index < 0 || index > items.weapons.length + items.list.length) return

			let tmpPlayer = findPlayerByID(conn.id)
			if (tmpPlayer && tmpPlayer.alive) {
				if (items.weapons[index]) {
					if (!tmpPlayer.admin && tmpPlayer.upgrAge !== items.weapons[index].age) {
						return
					}
					if (!tmpPlayer.admin && items.weapons[index].pre && tmpPlayer.weapons.indexOf(items.weapons[index].pre) === -1) {
						return
					}
					if ((tmpPlayer.weaponIndex < 9) === (index < 9)) {
						tmpPlayer.weaponIndex = index
					}
					tmpPlayer.weapons[index < 9 ? 0 : 1] = index
					if (config.inSandbox && config.enhancedSandbox) {
						tmpPlayer.weaponXP[index] = 20000
					}
					server.send(conn.id, "17", [tmpPlayer.weapons, 1])
				} else {
					index -= 16
					if (!items.list[index]) { 
						return
					}
					if (!tmpPlayer.admin && tmpPlayer.upgrAge !== items.list[index].age) {
						return
					}
					if (tmpPlayer.buildIndex !== -1 && items.list[index].group.id === items.list[tmpPlayer.buildIndex].group.id) {
						tmpPlayer.buildIndex = index
					}

					let addedItem = false
					for (let i = 0; i < tmpPlayer.items.length; i++) {
						if (items.list[tmpPlayer.items[i]].group.id === items.list[index].group.id) {
							tmpPlayer.items[i] = index
							addedItem = true
							break
						}
					}
					if (!addedItem) {
						tmpPlayer.items.push(index)
					}
					server.send(conn.id, "17", [tmpPlayer.items])
				}
				tmpPlayer.upgrAge++
				tmpPlayer.upgradePoints--
				server.send(conn.id, "16", [tmpPlayer.upgradePoints, tmpPlayer.upgrAge])
			}
		}

		function storeFunction(isBuy, id, isTail) {
			if (MODE === "HOCKEY") return
			let tmpPlayer = findPlayerByID(conn.id)
			if (tmpPlayer && tmpPlayer.alive) {
				var tmpObj = null
				if (id !== 0) {
					if (isTail) {
						for (let i = 0; i < accessories.length; ++i) {
							if (accessories[i].id === id) {
								tmpObj = accessories[i]
								break
							}
						}
					} else {
						for (let i = 0; i < hats.length; i++) {
							if (hats[i].id === id) {
								tmpObj = hats[i]
								break
							}
						}
					}
					if (!tmpObj) return
				}

				let free = config.inSandbox && config.enhancedSandbox

				if (isTail) {
					if (isBuy) {
						if (free || tmpObj.price <= tmpPlayer.points) {
							if (!free) tmpPlayer.addResource(3, -tmpObj.price)
							tmpPlayer.tails[id] = true
							server.send(conn.id, "us", [0, id, isTail])
						}
					} else if (!tmpObj || tmpPlayer.tails[id]) {
						if (tmpPlayer.usingStore && !config.allowSimultStoreActions) return
						if (tmpPlayer.tailIndex == id) return

						tmpPlayer.usingStore = true
						tmpPlayer.tail = tmpObj
						tmpPlayer.tailIndex = id
						server.send(conn.id, "us", [1, id, isTail])
					}
				} else {
					if (isBuy) {
						if (free || tmpObj.price <= tmpPlayer.points) {
							if (!free) tmpPlayer.addResource(3, -tmpObj.price)
							tmpPlayer.skins[id] = true
							server.send(conn.id, "us", [0, id, isTail])
						}
					} else if (!tmpObj || tmpPlayer.skins[id]) {
						if (tmpPlayer.usingStore && !config.allowSimultStoreActions) return
						if (tmpPlayer.skinIndex == id) return
							
						tmpPlayer.usingStore = true
						tmpPlayer.skin = tmpObj
						tmpPlayer.skinIndex = id
						server.send(conn.id, "us", [1, id, isTail])
					}
				}
			}
		}

		function createAllaince(name) {
			let tmpPlayer = findPlayerByID(conn.id)

			if (tmpPlayer.clanCooldown > 0) return
			tmpPlayer.clanCooldown = config.chatCooldown

			name = UTILS.filterText(name, 7)
			if (!name || typeof name !== "string") return

			if (MODE === "HOCKEY") return

			if (tmpPlayer && tmpPlayer.alive) {
				if (tribeManager.getTribe(name) == null) {
					const tmpClan = tribeManager.createTribe(name, tmpPlayer)
					server.sendAll("ac", [tmpClan.getData()])
					server.send(conn.id, "st", [name, 1])
				}
			}
		}

		function leaveAlliance() {
			if (MODE === "HOCKEY") return
			let tmpPlayer = findPlayerByID(conn.id)
			if (tmpPlayer && tmpPlayer.alive) {
				if (tmpPlayer.isLeader) {
					server.sendAll("ad", [tmpPlayer.team])
					tribeManager.deleteTribe(tmpPlayer.team)
				} else {
					tribeManager.getTribe(tmpPlayer.team).removePlayer(tmpPlayer)
					server.send(conn.id, "st", [null, 0])
				}
			}
		}

		function kickFromClan(sid) {
			if (MODE === "HOCKEY") return
			let tmpPlayer = findPlayerByID(conn.id)
			if (tmpPlayer && tmpPlayer.alive && tmpPlayer.isLeader) {
				const tmpObj = findPlayerBySID(sid)
				if (tmpObj) {
					tribeManager.getTribe(tmpPlayer.team).removePlayer(tmpObj)
					server.send(tmpObj.id, "st", [null, 0])
				}
			}
		}

		function sendJoinRequest(sid) {
			let tmpPlayer = findPlayerByID(conn.id)
			if (tmpPlayer && tmpPlayer.alive) {
				const tmpClan = tribeManager.getTribe(sid)
				if (tmpClan) {
					let isRequestSent = false
					for (let i = 0; i < tmpClan.joinQueue.length; i++) {
						if (tmpClan.joinQueue[i][1] === conn.id) {
							isRequestSent = true
							break
						}
					}

					if (!isRequestSent) {
						tmpClan.joinQueue.push([tmpPlayer.sid, tmpPlayer.id])
						server.send(findPlayerBySID(tmpClan.ownerID).id, "an", [tmpPlayer.sid, tmpPlayer.name])
					}
				}
			}
		}

		function decideJoinRequest(sid, join) {
			let tmpPlayer = findPlayerByID(conn.id)
			if (tmpPlayer && tmpPlayer.alive && tmpPlayer.isLeader) {
				const tmpObj = findPlayerBySID(sid)
				const tmpClan = tribeManager.getTribe(tmpPlayer.team)
				if (tmpClan && tmpObj) {
					let queue = tmpClan.joinQueue.shift()
					if (queue[1] !== tmpObj.id) return
					if (join && tmpObj.team == null) {
						tmpClan.addPlayer(tmpObj)
						server.send(tmpObj.id, "st", [tmpPlayer.team, 0])
					}
				}
			}
		}

		function sendMapPing(type) {
			if (type) {
				let tmpPlayer = findPlayerByID(conn.id)
				if (tmpPlayer && tmpPlayer.alive && tmpPlayer.mapPingCooldown <= 0) {
					tmpPlayer.mapPingCooldown = 5000
					if (tmpPlayer.team) {
						for (let i = 0; i < players.length; i++) {
							if (players[i] && players[i].team === tmpPlayer.team) {
								server.send(players[i].id, "p", [tmpPlayer.x, tmpPlayer.y])
							}
						}
					} else {
						server.send(conn.id, "p", [tmpPlayer.x, tmpPlayer.y])
					}
				}
			}
		}
	})

	let tmpA = new Player(
		conn.id,
		conn.sid,
		config,
		UTILS,
		projectileManager,
		objectManager,
		players,
		ais,
		items,
		hats,
		accessories,
		server,
		scoreCallback,
		iconCallback,
		MODE
	)
	players.push(tmpA)
	tmpA.visible = false

	server.send(conn.id, "io-init", [conn.id])
	let teamsData = []
	for (const key in tribeManager.tribes) {
		teamsData.push(tribeManager.tribes[key].getData())
	}
	server.send(conn.id, "id", [{ teams: teamsData }])
})

// GAME TICK
setInterval(() => {
	now = Date.now()
	delta = now - lastUpdate
	lastUpdate = now

	if (!players.length) return;

	for (let i = 0; i < players.length; ++i) {
		let tmpObj = players[i]
		if (tmpObj) {
			tmpObj.update(delta)
		}
	}

	for (let i = 0; i < ais.length; i++) {
		let tmpObj = ais[i]
		if (tmpObj) {
			tmpObj.update(delta)
		}
	}

	for (let i = 0; i < players.length; ++i) {
		let tmpObj = players[i]
		if (tmpObj && tmpObj.alive) {
			if (tmpObj.shootCount > 0) {
				tmpObj.shootCount -= delta
			} else if (tmpObj.skin && tmpObj.skin.turret) {
				var tmpPlayer, bestDst, tmpDist
				for (let i = 0; i < players.length; ++i) {
					if (
						players[i].alive &&
						!(players[i].skin && players[i].skin.antiTurret) &&
						players[i].sid !== tmpObj.sid &&
						!(tmpObj.team && tmpObj.team == players[i].team)
					) {
						tmpDist = UTILS.getDistance(tmpObj.x, tmpObj.y, players[i].x, players[i].y)
						if (tmpDist <= tmpObj.skin.turret.range && (!tmpPlayer || tmpDist < bestDst)) {
							bestDst = tmpDist
							tmpPlayer = players[i]
						}
					}
				}
				for (let i = 0; i < ais.length; ++i) {
					if (ais[i].alive && ais[i].hostile) {
						tmpDist = UTILS.getDistance(tmpObj.x, tmpObj.y, ais[i].x, ais[i].y)
						if (tmpDist <= tmpObj.skin.turret.range && (!tmpPlayer || tmpDist < bestDst)) {
							bestDst = tmpDist
							tmpPlayer = ais[i]
						}
					}
				}
				if (tmpPlayer) {
					tmpObj.shootCount = tmpObj.skin.turret.rate
					projectileManager.addProjectile(
						tmpObj.x,
						tmpObj.y,
						UTILS.getDirection(tmpPlayer.x, tmpPlayer.y, tmpObj.x, tmpObj.y),
						tmpObj.skin.turret.range,
						1.5,
						tmpObj.skin.turret.proj,
						tmpObj
					)
				}
			}
		}
	}

	for (let i = 0; i < objectManager.updateObjects.length; i++) {
		let tmpObj = objectManager.updateObjects[i]
		if (tmpObj.shootCount > 0) {
			tmpObj.shootCount -= delta
		} 
		
		if (tmpObj.shootCount <= 0) {
			var tmpPlayer, bestDst, tmpDist
			for (let i = 0; i < players.length; ++i) {
				if (
					players[i].alive &&
					!(players[i].skin && players[i].skin.antiTurret) &&
					players[i].sid !== tmpObj.owner.sid &&
					!(tmpObj.owner.team && tmpObj.owner.team == players[i].team)
				) {
					tmpDist = UTILS.getDistance(tmpObj.x, tmpObj.y, players[i].x, players[i].y)
					if (tmpDist <= tmpObj.shootRange && (!tmpPlayer || tmpDist < bestDst)) {
						bestDst = tmpDist
						tmpPlayer = players[i]
					}
				}
			}
			for (let i = 0; i < ais.length; ++i) {
				if (ais[i].alive && ais[i].hostile) {
					tmpDist = UTILS.getDistance(tmpObj.x, tmpObj.y, ais[i].x, ais[i].y)
					if (tmpDist <= tmpObj.shootRange && (!tmpPlayer || tmpDist < bestDst)) {
						bestDst = tmpDist
						tmpPlayer = ais[i]
					}
				}
			}
			if (tmpPlayer) {
				tmpObj.dir = UTILS.getDirection(tmpPlayer.x, tmpPlayer.y, tmpObj.x, tmpObj.y)
				projectileManager.addProjectile(tmpObj.x, tmpObj.y, tmpObj.dir, tmpObj.shootRange, 1.5, tmpObj.projectile, tmpObj.owner, tmpObj.sid)
				server.sendAll("sp", [tmpObj.sid, tmpObj.dir])
			}
			tmpObj.shootCount = tmpObj.shootRate
		}
	}

	for (let i = 0; i < projectiles.length; i++) {
		projectiles[i].update(delta)
	}

	for (let j = 0; j < players.length; j++) {
		let tmpPlayer = players[j]
		if (tmpPlayer) {
			const tmpPlayersData = []
			for (let i = 0; i < players.length; ++i) {
				let tmpObj = players[i]
				if (tmpObj && tmpPlayer.canSee(tmpObj)) {
					if (!tmpObj.sentTo[tmpPlayer.id]) {
						tmpObj.sentTo[tmpPlayer.id] = 1
						server.send(tmpPlayer.id, "2", [
							[tmpObj.id, tmpObj.sid, tmpObj.name, tmpObj.x, tmpObj.y, tmpObj.dir, tmpObj.health, tmpObj.maxHealth, config.playerScale, tmpObj.skinColor],
							tmpObj.id === tmpPlayer.id
						])
					}
					if (tmpObj.alive) {
						tmpPlayersData.push(
							tmpObj.sid,
							tmpObj.x,
							tmpObj.y,
							tmpObj.dir,
							tmpObj.buildIndex,
							tmpObj.weaponIndex,
							config.fetchVariant(tmpObj).id,
							tmpObj.team,
							tmpObj.isLeader ? 1 : 0,
							tmpObj.shameTimer > 0 ? 45 : tmpObj.skinIndex,
							tmpObj.tailIndex,
							tmpObj.iconIndex,
							tmpObj.zIndex
						)
					}
				}
			}
			server.send(tmpPlayer.id, "33", [tmpPlayersData])

			const tmpAiData = []
			for (let i = 0; i < ais.length; ++i) {
				let tmpObj = ais[i]
				if (tmpObj && tmpObj.alive && tmpPlayer.canSee(tmpObj)) {
					tmpAiData.push(tmpObj.sid, tmpObj.index, tmpObj.x, tmpObj.y, tmpObj.dir, tmpObj.health, tmpObj.nameIndex)
				}
			}
			if (tmpPlayer.joinedOnce) server.send(tmpPlayer.id, "a", [tmpAiData])

			const tmpObjectsData = []
			for (let i = 0; i < gameObjects.length; i++) {
				let tmpObj = gameObjects[i]
				if (tmpObj && tmpObj.active && (
					(tmpPlayer.canSee(tmpObj) && tmpObj.visibleToPlayer(tmpPlayer)) ||
					tmpPlayer.trueSight
				) && !tmpObj.sentTo[tmpPlayer.id]) {
					tmpObj.sentTo[tmpPlayer.id] = 1
					tmpObjectsData.push(tmpObj.sid, tmpObj.x, tmpObj.y, tmpObj.dir, tmpObj.scale, tmpObj.type, tmpObj.id, tmpObj.owner?.sid)
				}
			}
			server.send(tmpPlayer.id, "6", [tmpObjectsData])
		}
	}

	for (let i = players.length - 1; i >= 0; --i) {
		let tmpObj = players[i]
		if (!tmpObj.isBot) continue

		if (tmpObj.removing === undefined) tmpObj.removing = -1

		if (tmpObj.removing > 0) {
			tmpObj.removing--
		}
		else if (tmpObj.removing === 0) {
			objectManager.removeAllItems(tmpObj.sid, server)
			server.sendAll("4", [tmpObj.id])
			players.splice(i, 1)
			playersSid.delete(tmpObj.sid)
			updateLeaderboard()
			iconCallback()
			continue
		}

		if (tmpObj.removing === -1 && !tmpObj.alive) {
			tmpObj.removing = 27
		}
	}
}, 1000 / config.serverUpdateRate)

function updateLeaderboard() {
	const tmpLeaderboardData = []
	for (const player of players
		.filter((player) => player.alive)
		.sort(UTILS.sortByPoints)
		.slice(0, 10)) {
		tmpLeaderboardData.push(player.sid, player.name, player.points)
	}
	server.sendAll("5", [tmpLeaderboardData])
}

// Update Leaderboard
setInterval(() => {
	for (let i = 0; i < players.length; i++) {
		if (players[i].pps) {
			scoreCallback(players[i], players[i].pps)
		}
	}
	updateLeaderboard()
}, 1000)

// SEND MAP DATA
setInterval(() => {
	for (const key in tribeManager.tribes) {
		const tmpMembers = tribeManager.tribes[key].members
		const tmpPlayersID = []
		const posData = []
		for (let i = 0; i < tmpMembers.length; i++) {
			const tmpPlayer = findPlayerBySID(tmpMembers[i])
			if (!tmpPlayer) continue
			tmpPlayersID.push(tmpPlayer.id)
			posData.push(tmpPlayer.x, tmpPlayer.y)
		}
		for (let i = 0; i < tmpPlayersID.length; i++) {
			server.send(tmpPlayersID[i], "mm", [posData.filter((value, index) => ![i * 2, i * 2 + 1].includes(index))])
		}
	}
	for (let i = 0; i < players.length; i++) {
		if (players[i].team == null) {
			server.send(players[i].id, "mm", [0])
		}
	}
}, 3000)

function scoreCallback(player, amount, setResource) {
	player.points += amount
	player.earnXP(amount)
	server.send(player.id, "9", ["points", Math.round(player.points), 1])
}

function iconCallback() {
	var highestKill = 0
	var highest = null
	for (let i = 0; i < players.length; i++) {
		const player = players[i]
		player.iconIndex = 0
		if (player && player.alive && player.kills > 0 && (highest == null || highestKill < player.kills)) {
			highest = i
			highestKill = player.kill
		}
	}
	if (highest !== null) {
		players[highest].iconIndex = 1
	}
}

function addVolcano(x, y, scale) {
	objectManager.add(objectManager.objects.length, x, y, 0, scale, 4, null, true, null)
}

function addBossArenaStones(stoneCount, stoneScale, xCenter, yCenter) {
	const arenaScale = (stoneScale * stoneCount) / Math.PI
	for (let i = 0; i <= stoneCount; i++) {
		let tmpX = xCenter + arenaScale * Math.cos((i * 2 * Math.PI) / stoneCount)
		let tmpY = yCenter + arenaScale * Math.sin((i * 2 * Math.PI) / stoneCount)
		let size = UTILS.randInt(0, 1)
		if (i === 0) {
			tmpX -= 175
			size = 2
		} else if (i === stoneCount) {
			tmpX += 175
			size = 2
		}
		objectManager.add(objectManager.objects.length, tmpX, tmpY, UTILS.randFloat(-Math.PI, Math.PI), config.rockScales[size], 2, null, true, null)
	}
}

function addTree(treeCount) {
	for (let j = 0; j < treeCount; j++) {
		const tmpX = UTILS.randFloat(0, config.mapScale)
		const tmpY = UTILS.randInt(0, 1) ? UTILS.randFloat(0, 6850) : UTILS.randFloat(7550, 12000)
		const size = config.treeScales[UTILS.randInt(0, 3)]
		let overlap

		for (let i = 0; i < gameObjects.length; i++) {
			if (UTILS.getDistance(tmpX, tmpY, gameObjects[i].x, gameObjects[i].y) < Math.max(gameObjects[i].getScale(), 100) + size) {
				overlap = true
				break
			}
		}
		if (overlap) continue

		objectManager.add(objectManager.objects.length, tmpX, tmpY, UTILS.randFloat(-Math.PI, Math.PI), size, 0, null, true, null)
	}
}

function addBush(bushCount) {
	for (let j = 0; j < bushCount; j++) {
		const tmpX = UTILS.randFloat(0, config.mapScale)
		const tmpY = UTILS.randInt(0, 1) ? UTILS.randFloat(0, 6850) : UTILS.randFloat(7550, 12000)
		const size = config.bushScales[UTILS.randInt(0, 2)]
		let overlap

		for (let i = 0; i < gameObjects.length; i++) {
			if (UTILS.getDistance(tmpX, tmpY, gameObjects[i].x, gameObjects[i].y) < Math.max(gameObjects[i].getScale(), 100) + size) {
				overlap = true
				break
			}
		}
		if (overlap) continue

		objectManager.add(objectManager.objects.length, tmpX, tmpY, UTILS.randFloat(-Math.PI, Math.PI), size, 1, null, true, null)
	}
}

function addCacti(cactiCount) {
	for (let j = 0; j < cactiCount; j++) {
		const tmpX = UTILS.randFloat(0, config.mapScale)
		const tmpY = UTILS.randFloat(12000, config.mapScale)
		const size = config.bushScales[2]
		let overlap

		for (let i = 0; i < gameObjects.length; i++) {
			if (UTILS.getDistance(tmpX, tmpY, gameObjects[i].x, gameObjects[i].y) < Math.max(gameObjects[i].getScale(), 100) + size) {
				overlap = true
				break
			}
		}
		if (overlap) continue

		const tmpObj = objectManager.add(objectManager.objects.length, tmpX, tmpY, UTILS.randFloat(-Math.PI, Math.PI), size, 1, null, true, null)
		tmpObj.dmg = 35
	}
}

function addStoneGold(stoneCount, isStone) {
	for (let j = 0; j < stoneCount; j++) {
		const tmpX = UTILS.randFloat(0, config.mapScale)
		const tmpY = UTILS.randInt(0, 1) ? UTILS.randFloat(0, 6850) : UTILS.randFloat(7550, config.mapScale)
		const size = config.rockScales[UTILS.randInt(0, 2)]
		let overlap

		for (let i = 0; i < gameObjects.length; i++) {
			if (UTILS.getDistance(tmpX, tmpY, gameObjects[i].x, gameObjects[i].y) < Math.max(gameObjects[i].getScale(), 100) + size) {
				overlap = true
				break
			}
		}
		if (overlap) continue

		objectManager.add(objectManager.objects.length, tmpX, tmpY, UTILS.randFloat(-Math.PI, Math.PI), size, isStone ? 2 : 3, null, true, null)
	}
}

function addRiverStone(riverStoneCount) {
	for (let j = 0; j < riverStoneCount; j++) {
		const tmpX = UTILS.randFloat(0, config.mapScale)
		const tmpY = UTILS.randFloat(6850, 7550)
		const size = config.rockScales[UTILS.randInt(0, 2)]
		let overlap

		for (let i = 0; i < gameObjects.length; i++) {
			if (UTILS.getDistance(tmpX, tmpY, gameObjects[i].x, gameObjects[i].y) < Math.max(gameObjects[i].getScale(), 100) + size) {
				overlap = true
				break
			}
		}
		if (overlap) continue

		objectManager.add(objectManager.objects.length, tmpX, tmpY, UTILS.randFloat(-Math.PI, Math.PI), size, 2, null, true, null)
	}
}

function addAnimal() {
	const animalCount = [10, 10, 10, 2, 15, 2, 1, 1, 1, 1, 1, 1]
	for (let i = 0; i < animalCount.length; i++) {
		for (let j = 0; j < animalCount[i]; j++) {
			let info = aiManager.aiTypes[i]
			if (!info) continue
			aiManager.spawn(
				info.fixedSpawn 
					? info.minSpawnRange && info.maxSpawnRange
						? UTILS.randInt(config.mapScale * info.minSpawnRange, config.mapScale * info.maxSpawnRange)
						: config.mapScale / 2 
					: UTILS.randFloat(0, config.mapScale),
				info.fixedSpawn 
					? info.minSpawnRange && info.maxSpawnRange
						? UTILS.randInt(config.mapScale * info.minSpawnRange, config.mapScale * info.maxSpawnRange)
						:config.mapScale - config.snowBiomeTop / 2 
					: UTILS.randFloat(0, config.mapScale),
				Math.PI / 2,
				i
			)
		}
	}
}

function setupServer() {
	config.isStarted = false
	ais = []
	players = []
	gameObjects = []
	projectiles = []
	connection = []
	playersSid = new Set()
	objectManager = new ObjectManager(GameObject, gameObjects, UTILS, config, players, server)
	aiManager = new AiManager(ais, AI, players, items, objectManager, config, UTILS, scoreCallback, server)
	projectileManager = new ProjectileManager(Projectile, projectiles, players, ais, objectManager, items, config, UTILS, server)
	tribeManager = new TribeManager(Tribe, findPlayerBySID, server)

	server.clients.forEach((socket) => {
		if (socket.readyState === WebSocket.OPEN) {
			socket.close()
		}
	})

	switch (MODE) {
		case "NORMAL": case "SANDBOX": {
			config.inSandbox = MODE === "SANDBOX"
			config.canHitObj = true
			if (config.volcanoEnabled) {
				addVolcano(config.volcanoPos, config.volcanoPos, config.volcanoScale)
			}
			addBossArenaStones(config.totalRocks - 1, config.rockScales[1], config.mapScale / 2, config.mapScale - config.snowBiomeTop / 2)
			addTree(200)
			addBush(100)
			addCacti(20)
			addStoneGold(100, true)
			addStoneGold(10, false)
			addRiverStone(15)
			addAnimal()
			break
		}
		case "ZOMBIE": {
			config.inSandbox = true
			config.canHitObj = true
			addTree(200)
			addBush(100)
			addCacti(20)
			addStoneGold(100, true)
			addStoneGold(10, false)
			break
		}
		case "HOCKEY": {
			config.canHitObj = false
			for (let i = 0; i < 40; i++) {
				objectManager.add(objectManager.objects.length, 3000 + i * items.list[18].scale * 2, 3000, 0, items.list[18].scale, items.list[18].id, items.list[18])
				objectManager.add(
					objectManager.objects.length,
					3000 + i * items.list[18].scale * 2,
					3000 + 19 * items.list[18].scale * 2,
					0,
					items.list[18].scale,
					items.list[18].id,
					items.list[18]
				)
			}
			for (let i = 0; i < 20; i++) {
				if (i >= 7 && i <= 12) continue
				objectManager.add(
					objectManager.objects.length,
					3000,
					3000 + i * items.list[18].scale * 2,
					Math.PI / 2,
					items.list[18].scale,
					items.list[18].id,
					items.list[18]
				)
				objectManager.add(
					objectManager.objects.length,
					3000 + 39 * items.list[18].scale * 2,
					3000 + i * items.list[18].scale * 2,
					Math.PI / 2,
					items.list[18].scale,
					items.list[18].id,
					items.list[18]
				)
			}

			playersSid = new Set([1])
			let tmpA = new Player(
				UTILS.randomString(10),
				1,
				config,
				UTILS,
				projectileManager,
				objectManager,
				players,
				ais,
				items,
				hats,
				accessories,
				server,
				scoreCallback,
				iconCallback,
				MODE
			)
			players.push(tmpA)
		}
	}
}

const httpServer = http.createServer(async (req, res) => {
	res.setHeader("Access-Control-Allow-Origin", "*")
	res.setHeader("Access-Control-Request-Method", "*")
	res.setHeader("Access-Control-Allow-Methods", "OPTIONS, GET")
	res.setHeader("Access-Control-Allow-Headers", "*")

	let url = new URL("https://localhost" + req.url);
	let pathname = url.pathname.replace(/\/$/, "");
	let filePath = path.join(PUBLIC_DIR, pathname || "html/play.html")

	if (pathname == "/list") {
		const tmpObj = []
		for (let i = 0; i < players.length; i++) {
			tmpObj.push({
				name: players[i].name,
				sid: players[i].sid
			})
		}
		res.writeHead(200, { "Content-Type": "application/json" })
		return res.end(JSON.stringify(tmpObj))
	}

	const contentType = mimeTypes = {
		".html": "text/html",
		".js": "text/javascript",
		".css": "text/css",
		".png": "image/png"
	}[path.extname(filePath).toLowerCase()] || "application/octet-stream"

	try {
		const content = await fs.readFile(filePath)
		res.writeHead(200, { 
			"Content-Type": contentType,
			"Content-Disposition": `inline; filename="${path.basename(filePath)}"`
		})
		return res.end(content)
	} catch (error) {
		if (error.code === "ENOENT") {
			res.writeHead(404)
			return res.end(`Not Found: ${pathname}`)
		} else {
			res.writeHead(500)
			return res.end(`Server Error: ${error}`)
		}
	}
})

httpServer.on("upgrade", (request, socket, head) => {
	// Provide a dummy base URL because request.url is a relative path
	const parsedUrl = new URL(request.url, "http://localhost");
	const pathname = parsedUrl.pathname.replace(/\/$/, "");

	if (pathname === "/ws") {
		server.handleUpgrade(request, socket, head, (ws) => {
			server.emit("connection", ws, request);
		});
	} else {
		socket.destroy();
	}
});


httpServer.listen(PORT, () => {
	setupServer()
	commandStart()
})

async function commandStart() {
	console.clear()
	if (!(await checkLatest())) {
		console.log("Update available at https://github.com/kookywarrior/moomooio-private-server")
	}
	console.log(`Private server listening at http://localhost:${PORT}\n`)
	const command = await inquirer.prompt({
		name: "command",
		type: "list",
		message: "Custom command",
		choices: ["Change mode", "Change password", "Change prefix", "Kick player", "Restart server"]
	})
	if (command.command === "Change mode") {
		const mode = await inquirer.prompt({
			name: "mode",
			type: "list",
			message: "Select mode",
			choices: ["NORMAL", "SANDBOX", "HOCKEY"]
		})
		const modeType = [["HOCKEY"], ["SANDBOX", "NORMAL"]]
		function areInSameGroup(arg1, arg2) {
			for (const group of modeType) {
				if (group.includes(arg1) && group.includes(arg2)) {
					return true
				}
			}
			return false
		}

		if (areInSameGroup(MODE, mode.mode)) {
			MODE = mode.mode
		} else {
			const restart = await inquirer.prompt({
				name: "restart",
				type: "confirm",
				message: "Are you sure you want to restart server?"
			})
			if (restart.restart) {
				MODE = mode.mode
				setupServer()
			}
		}
	} else if (command.command === "Change password") {
		const password = await inquirer.prompt({
			name: "password",
			type: "input",
			message: "Input password:"
		})
		PASSWORD = password.password
	} else if (command.command === "Change prefix") {
		const prefix = await inquirer.prompt({
			name: "prefix",
			type: "list",
			message: "Select prefix",
			choices: ["!", "?", "/", "\\", "`", "'", '"', ":", "|", ";", "<", ">", ",", ".", "~"]
		})
		PREFIX = prefix.prefix
	} else if (command.command === "Kick player") {
		const sid = await inquirer.prompt({
			name: "sid",
			type: "number",
			message: "Input player sid:"
		})
		if (sid.sid != null) {
			for (let i = 0; i < players.length; i++) {
				let tmpPlayer = players[i]
				if (tmpPlayer.sid === sid.sid) {
					if (MODE === "HOCKEY" && sid.sid !== 1) {
						connection[tmpPlayer.id].close()
						break
					} else {
						connection[tmpPlayer.id].close()
						break
					}
				}
			}
		}
	} else if (command.command === "Restart server") {
		const restart = await inquirer.prompt({
			name: "restart",
			type: "confirm",
			message: "Are you sure you want to restart server?"
		})
		if (restart.restart) {
			setupServer()
		}
	}
	commandStart()
}
