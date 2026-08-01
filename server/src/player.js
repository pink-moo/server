var mathABS = Math.abs
var mathCOS = Math.cos
var mathSIN = Math.sin
var mathPOW = Math.pow
var mathSQRT = Math.sqrt
module.exports = function (
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
	scoreCallback,
	iconCallback,
	MODE
) {
	this.id = id
	this.sid = sid
	this.tmpScore = 0
	this.team = null
	this.skinIndex = MODE === "HOCKEY" && this.sid !== 1 ? 12 : 0
	this.tailIndex = MODE === "HOCKEY" && this.sid !== 1 ? 11 : 0
	this.skin = MODE === "HOCKEY" && this.sid !== 1 ? { spdMult: 1.16 } : null
	this.tail = MODE === "HOCKEY" && this.sid !== 1 ? { spdMult: 1.35 } : null
	this.primary = null
	this.primaryVariant = 0
	this.secondary = null
	this.secondaryVariant = 0
	this.hitTime = 0
	this.tails = {}
	for (let i = 0; i < accessories.length; ++i) {
		if (accessories[i].price <= 0) {
			this.tails[accessories[i].id] = 1
		}
	}
	this.skins = {}
	for (let i = 0; i < hats.length; ++i) {
		if (hats[i].price <= 0) {
			this.skins[hats[i].id] = 1
		}
	}
	this.points = 0
	this.dt = 0
	this.hidden = false
	this.itemCounts = {}
	this.isPlayer = true
	this.pps = 0
	this.moveDir = undefined
	this.skinRot = 0
	this.lastPing = 0
	this.iconIndex = 0
	this.skinColor = 0
	this.usingStore = false
	this.clanCooldown = 0

	// SPAWN:
	this.spawn = function (moofoll) {
		this.joinedOnce = true
		this.sentTo = {}
		this.active = true
		this.alive = true
		this.lockMove = false
		this.lockDir = false
		this.minimapCounter = 0
		this.chatCooldown = 0
		this.chatCountdown = 0
		this.mapPingCooldown = 0
		this.shameCount = 0
		this.shameTimer = 0
		this.gathering = 0
		this.autoGather = 0
		this.animTime = 0
		this.animSpeed = 0
		this.mouseState = 0
		this.buildIndex = -1
		this.weaponIndex = MODE === "HOCKEY" ? 6 : 0
		this.dmgOverTime = {}
		this.noMovTimer = 0
		this.maxXP = 300
		this.XP = 0
		this.age = 1
		this.kills = 0
		this.upgrAge = 2
		this.upgradePoints = 0
		this.x = 0
		this.y = 0
		this.zIndex = 0
		this.xVel = 0
		this.yVel = 0
		this.slowMult = 1
		this.dir = 0
		this.dirPlus = 0
		this.targetDir = 0
		this.targetAngle = 0
		this.maxHealth = 100
		this.health = this.maxHealth
		this.lastDamage = 0
		this.scale = config.playerScale
		this.speed = config.playerSpeed
		this.resetMoveDir()
		this.resetResources(moofoll)
		this.items = [0, 3, 6, 10]
		this.weapons = [0]
		this.shootCount = 0
		this.weaponXP = []
		this.reloads = {}
		this.clanCooldown = 0
		this.trapped = null

		if (config.inSandbox && config.enhancedSandbox) {
			this.age = 10
			this.upgradePoints = 9
			this.maxXP *= Math.pow(1.2, 9)
			setTimeout(() => {
				server.send(this.id, "16", [this.upgradePoints, this.upgrAge])
				server.send(this.id, "15", [this.XP, UTILS.fixTo(this.maxXP, 1), this.age])
			}, 1000 / config.serverUpdateRate)
		}

		if (this.isBot) {
			this.autoHeal = 1
			this.autoEquip = 1
			this.autoPlace = 1
			this.autoBreak = 1
			this.autoWalk = 1
			this.autoHit = 1

			this.ping = 2

			this.weapons[0] = 5
			this.weapons[1] = 10
			this.weaponXP[this.weapons[0]] = 999999
			this.weaponXP[this.weapons[1]] = 999999
			this.reloads[this.weapons[0]] = 0
			this.reloads[this.weapons[1]] = 0

			this.weaponIndex = this.weapons[1]

			this.enemy = null
			this.soldier = 0

			this.hitNext = false
			this.empNext = false
			this.keepWalking = 0
		}
	}

	// RESET MOVE DIR:
	this.resetMoveDir = function () {
		this.moveDir = undefined
	}

	// RESET RESOURCES:
	this.resetResources = function (moofoll) {
		for (var i = 0; i < config.resourceTypes.length; ++i) {
			this[config.resourceTypes[i]] = moofoll ? 100 : 0
		}
	}

	// ADD ITEM:
	this.addItem = function (id) {
		var tmpItem = items.list[id]
		if (tmpItem) {
			for (var i = 0; i < this.items.length; ++i) {
				if (items.list[this.items[i]].group == tmpItem.group) {
					if (this.buildIndex == this.items[i]) {
						this.buildIndex = id
					}
					this.items[i] = id
					return true
				}
			}
			this.items.push(id)
			return true
		}
		return false
	}

	// SET USER DATA:
	this.setUserData = function (data) {
		if (data) {
			// SET INITIAL NAME:
			this.name = "unknown"

			// VALIDATE NAME:
			var name = data.name + ""
			name = name.slice(0, config.maxNameLength)
			name = name.replace(/[^\w:\(\)\/? -]+/gim, " ") // USE SPACE SO WE CAN CHECK PROFANITY
			name = name.replace(/[^\x00-\x7F]/g, " ")
			name = name.trim()
			if (name.length > 0) {
				this.name = name
			}

			// SKIN:
			this.skinColor = 0
			if (config.skinColors[data.skin]) {
				this.skinColor = data.skin
			}
		}
	}

	// GET DATA TO SEND:
	this.getData = function () {
		return [
			this.id,
			this.sid,
			this.name,
			UTILS.fixTo(this.x, 2),
			UTILS.fixTo(this.y, 2),
			UTILS.fixTo(this.dir, 3),
			this.health,
			this.maxHealth,
			this.scale,
			this.skinColor
		]
	}

	// SET DATA:
	this.setData = function (data) {
		this.id = data[0]
		this.sid = data[1]
		this.name = data[2]
		this.x = data[3]
		this.y = data[4]
		this.dir = data[5]
		this.health = data[6]
		this.maxHealth = data[7]
		this.scale = data[8]
		this.skinColor = data[9]
	}

	this.updateBot = function (delta) {
		if (!this.alive) return

		let enemyDistSq = Infinity
		this.enemy = null
		for (let pl of players.filter(pl => pl.active && pl.alive && !pl.isBot)) {
			let distSq = Math.abs(pl.x - this.x) ** 2 + Math.abs(pl.y - this.y) ** 2
			if (distSq <= 400 * 400 && distSq < enemyDistSq) {
				enemyDistSq = distSq
				this.enemy = pl
			}
		}

		let enemyDist = Math.sqrt(enemyDistSq)
		let enemyDir = this.enemy ? UTILS.getDirection(this.enemy.x, this.enemy.y, this.x, this.y) : undefined

		// auto break
		let breaking = false

		let trapDistSq = Infinity
		let breakObj = null

		let tmpList = this.autoBreak ? objectManager.getGridArrays(this.x, this.y, this.scale) : []
		for (var x = 0; x < tmpList.length; ++x) {
			for (var y = 0; y < tmpList[x].length; ++y) {
				let obj = tmpList[x][y]
				if (!obj.active || !obj.dmg || !obj.owner || obj.owner.isBot) continue

				let distSq = Math.abs(obj.x - this.x) ** 2 + Math.abs(obj.y - this.y) ** 2
				if (distSq > (items.weapons[this.weapons[1]].range + obj.scale) ** 2) continue

				if (distSq < trapDistSq) {
					trapDistSq = distSq
					breakObj = obj
				}
			}
		}
		if (!breakObj && this.trapped) {
			breakObj = this.trapped
		}

		if (breakObj) {
			this.dir = UTILS.getDirection(breakObj.x, breakObj.y, this.x, this.y)
			this.weaponIndex = this.weapons[1]
			this.gathering = true

			if (this.reloads[this.weapons[1]] <= 0) {
				breaking = true
			}
		}

		// auto walk
		if (this.keepWalking > 0) {
			this.keepWalking--
		}
		else {
			if (!this.autoWalk || breakObj || !this.enemy) {
				this.moveDir = undefined
			}
			else if (enemyDist > 200 || (this.enemy.lockMove && enemyDist > 50)) {
				this.moveDir = enemyDir
			}
			else {
				this.moveDir = enemyDir + Math.PI * 0.3
			}
		}

		// auto equip
		let hat = hats.find(h => {
			if (this.soldier) {
				return h.dmgMult < 1
			}
			else if (this.enemy && enemyDist <= 250 && this.enemy.skin?.turret && this.enemy.shootCount === this.enemy.skin.turret.rate) {
				return h.dmgMult < 1
			}
			else if (
				this.empNext && 
				this.enemy && 
				this.enemy.shootCount <= 0 &&
				items.weapons[this.enemy.weapons[1]]?.projectile
			) {
				return h.antiTurret
			}
			else if (breaking) {
				return h.bDmg > 0
			}
			else if (this.shameCount > 0 && timerCount - delta <= 0 && !this.dmgOverTime.time) {
				return h.healthRegen < 0
			}
			else if (!this.enemy) {
				return h.poisonRes
			}
			else if (enemyDist < 250) {
				if (this.lockMove || this.enemy.reloads[this.enemy.weapons[0]] > 0 || this.reloads[this.weapons[0]] > 0) {
					return h.dmgMult < 1
				}
				else {
					return h.dmg > 0
				}
			}
			else if (this.moveDir !== undefined) {
				if (this.y <= config.snowBiomeTop) {
					return h.coldM >= 1
				}
				else if (
					this.y >= config.mapScale / 2 - config.riverWidth / 2 && 
					this.y <= config.mapScale / 2 + config.riverWidth / 2
				) {
					return h.watrImm
				}
				else {
					return h.spdMult > 1
				}
			}

			return h.antiTurret
		})
		let acc = hat.id === this.skinIndex || config.allowSimultStoreActions
			? accessories.find(t => 
					this.enemy && enemyDist <= 250
						? this.moveDir === undefined
							? t.id === 21
							: t.id === 19 
						: this.moveDir === undefined
							? t.id === 20
							: t.id === 11
				)
			: this.tail

		if (this.soldier) this.soldier--
		this.empNext = false

		let hitDmg = Math.ceil(
			items.weapons[this.weapons[0]].dmg 
				* config.fetchVariant(this, this.weapons[0]).val 
				* 1.5
		)
		let hitDist = this.enemy ? items.weapons[this.weapons[0]].range + this.enemy.scale * 1.8 : 0

		let turret = false
		let hitting = false

		// placer & spike tick
		if (this.autoPlace && this.enemy && enemyDist <= 500) {
			let oldDir = this.dir

			let PHI = Math.PI * 2
			for (let dir = 0; dir <= PHI; dir += PHI / 24) {
				var item = items.list[enemyDist <= 120 ? 9 : 15]

				this.dir = ((enemyDir + dir) % PHI + PHI) % PHI

				var tmpS = this.scale + item.scale + (item.placeOffset || 0)
				var tmpX = this.x + tmpS * mathCOS(this.dir)
				var tmpY = this.y + tmpS * mathSIN(this.dir)

				if (objectManager.checkItemLocation(tmpX, tmpY, item.scale, 0.6, item.id, false, this)) {
					this.buildItem(item)
					if (
						item.id === 9 &&
						enemyDist <= hitDist &&
						UTILS.getDistance(tmpX, tmpY, this.enemy.x, this.enemy.y) <= item.scale + this.enemy.scale
					) {
						hitting = true
					}
				}
			}

			this.dir = oldDir
		}

		// kb tick
		let kbX, kbY
		if (this.enemy) {
			kbX = this.enemy.x + Math.cos(enemyDir) * 48
			kbY = this.enemy.y + Math.sin(enemyDir) * 48
		}

		let kbDistSq = Infinity
		let kbSpike = null

		tmpList = this.enemy && !this.enemy.lockMove && enemyDist <= hitDist
			? objectManager.getGridArrays(kbX, kbY, this.enemy.scale + 48) 
			: []
		for (var x = 0; x < tmpList.length; ++x) {
			for (var y = 0; y < tmpList[x].length; ++y) {
				let obj = tmpList[x][y]
				if (!obj.active || !obj.dmg || !obj.owner || !obj.owner.isBot) continue

				let distSq = Math.abs(obj.x - kbX) ** 2 + Math.abs(obj.y - kbY) ** 2
				if (distSq > (this.enemy.scale + obj.scale) ** 2) continue

				if (distSq < kbDistSq) {
					kbDistSq = distSq
					kbSpike = obj
				}
			}
		}
		if (kbSpike) {
			turret = true
		}

		// velocity tick
		if (
			!turret && !hitting &&
			!this.lockMove &&
			hitDmg >= 75 &&
			this.shootCount <= 0 &&
			this.reloads[this.weapons[0]] <= 0 &&
			enemyDist >= 225 && enemyDist <= 230 &&
			(
				!this.enemy.skin || 
				this.enemy.skinIndex === 11 || 
				(this.enemy.lockMove && this.enemy.reloads[this.enemy.weapons[1] === 10 ? 10 : this.enemy.weapons[0]] <= 0)
			)
		) {
			this.moveDir = enemyDir
			this.keepWalking = 1
			turret = true
		}

		// low health auto hit
		if (this.enemy && this.enemy.health <= hitDmg) {
			hitting = true
		}

		// 2 tick hit
		if (this.hitNext) {
			hitting = true
		}

		if (
			turret && 
			!hitting && 
			this.shootCount <= 0 && 
			this.reloads[this.weapons[0]] <= 0
		) {
			hat = hats.find(h => h.turret)
			this.hitNext = true
		}

		// finalize
		if (
			this.autoHit && 
			hitting && 
			this.reloads[this.weapons[0]] <= 0 &&
			this.enemy
		) {
			this.hitNext = false
			
			hat = hats.find(h => h.dmgMultO > 1)
			this.dir = enemyDir
			this.weaponIndex = this.weapons[0]
			this.gathering = true
		}

		if (!breakObj && !hitting) {
			this.weaponIndex = this.weapons[this.reloads[this.weapons[0]] > 0 ? 0 : 1]
		}

		if (this.autoEquip) {
			this.skin = hat
			this.tail = acc
			this.skinIndex = hat?.id || 0
			this.tailIndex = acc?.id || 0
		}
	}

	this.heal = function (dmg) {
		let count = Math.ceil(dmg / 40)
		while (count--)
			this.buildItem(items.list[1])
	}

	this.healBot = function (dmg, reason) {
		if (dmg >= this.maxHealth) return
		if (!this.autoHeal) return

		let delay = 0

		let antiInsta = false

		if (reason === "hit" && this.soldier) {
			antiInsta = true
		}
		else if (this.enemy) {
			if (dmg >= 20) {
				this.empNext = true
			}

			let enemyDmg = Math.ceil(
				items.weapons[this.enemy.weapons[0]].dmg 
					* config.fetchVariant(this.enemy, this.enemy.weapons[0]).val
					* 1.5
			)

			let bigDmg = dmg >= (this.skin?.dmgMult < 1 ? 25 : 10) && enemyDmg >= 60;
			let otherWays = ["spike", "projectile"].includes(reason) && enemyDmg >= this.health;

			if (
				(bigDmg || otherWays) &&
				this.enemy.reloads[this.enemy.weapons[0]] <= 0
			) {
				antiInsta = true
			}
		}

		if (antiInsta) {
			if (this.shameCount < 5) {
				if (items.weapons[this.enemy.weapons[0]].speed <= 300) {
					delay = Math.random() < 0.6 ? 60 : 200
				}
				else {
					delay = 20
				}
			}
			else {
				delay = 200
			}
		}
		else if (dmg <= 5) {
			delay = Math.random() < 0.6 ? 200 : 360
		}
		else {
			delay = 200
		}

		setTimeout(
			() => {
				this.heal(dmg)
			}, 
			delay
			// this.lockMove 
			// 	? 200 
			// 	: (this.shameCount < 3 && dmg > 5) || (this.shameCount < 5 && dmg > 25)
			// 		? 60 
			// 		: 200
		)
	}

	// UPDATE:
	var timerCount = 0
	this.update = function (delta) {
		if (!this.alive) return

		// SHAME SHAME SHAME:
		if (this.shameTimer > 0) {
			this.shameTimer -= delta
			if (this.shameTimer <= 0) {
				this.shameTimer = 0
				this.shameCount = 0
			}
		}

		// MAP PING COOLDOWN:
		if (this.mapPingCooldown > 0) {
			this.mapPingCooldown -= delta
		}


		// COOLDOWNS:
		if (this.chatCooldown > 0) {
			this.chatCooldown -= delta
		}

		if (this.clanCooldown > 0) {
			this.clanCooldown -= delta
		}

		// USING STORE:
		this.usingStore = false

		// REGENS AND AUTO:
		timerCount -= delta
		if (timerCount <= 0) {
			if (UTILS.getDistance(this.x, this.y, config.volcanoPos, config.volcanoPos) < config.volcanoDamageRange) {
				this.changeHealth(-1, "volcano", null)
			}
			var regenAmount = (this.skin && this.skin.healthRegen ? this.skin.healthRegen : 0) + (this.tail && this.tail.healthRegen ? this.tail.healthRegen : 0)
			if (regenAmount) {
				this.changeHealth(regenAmount, "regen", this)
			}
			if (this.dmgOverTime.dmg) {
				this.changeHealth(-this.dmgOverTime.dmg, "poison", this.dmgOverTime.doer)
				this.dmgOverTime.time -= 1
				if (this.dmgOverTime.time <= 0) {
					this.dmgOverTime.dmg = 0
				}
			}
			if (this.healCol) {
				this.changeHealth(this.healCol, "pad", this)
			}
			timerCount = 1000
		}

		// CHECK KILL:
		if (!this.alive) {
			return
		}

		// SLOWER:
		if (this.slowMult < 1) {
			this.slowMult += 0.0008 * delta
			if (this.slowMult > 1) {
				this.slowMult = 1
			}
		}

		// MOVE:
		this.noMovTimer += delta
		if (this.xVel > 0.0001 || this.yVel > 0.0001) this.noMovTimer = 0
		if (this.lockMove) {
			this.xVel = 0
			this.yVel = 0
		} else {
			var spdMult =
				(this.buildIndex >= 0 ? 0.5 : 1) *
				(items.weapons[this.weaponIndex].spdMult || 1) *
				(this.skin ? this.skin.spdMult || 1 : 1) *
				(this.tail ? this.tail.spdMult || 1 : 1) *
				(this.y <= config.snowBiomeTop ? (this.skin && this.skin.coldM ? 1 : config.snowSpeed) : 1) *
				this.slowMult

			if (!this.noClip && !this.zIndex && this.y >= config.mapScale / 2 - config.riverWidth / 2 && this.y <= config.mapScale / 2 + config.riverWidth / 2) {
				if (this.skin && this.skin.watrImm) {
					spdMult *= 0.75
					this.xVel += config.waterCurrent * 0.4 * delta
				} else {
					spdMult *= 0.33
					this.xVel += config.waterCurrent * delta
				}
			}
			var xVel = this.moveDir != undefined ? mathCOS(this.moveDir) : 0
			var yVel = this.moveDir != undefined ? mathSIN(this.moveDir) : 0
			var length = mathSQRT(xVel * xVel + yVel * yVel)
			if (length != 0) {
				xVel /= length
				yVel /= length
			}
			if (xVel) this.xVel += xVel * this.speed * spdMult * delta
			if (yVel) this.yVel += yVel * this.speed * spdMult * delta
		}

		// OBJECT COLL:
		this.zIndex = 0
		this.lockMove = false
		this.trapped = null
		this.healCol = 0
		let tmpList
		const tmpSpeed = UTILS.getDistance(0, 0, this.xVel * delta, this.yVel * delta)
		const depth = Math.min(4, Math.max(1, Math.round(tmpSpeed / 40)))
		const tMlt = 1 / depth
		for (let i = 0; i < depth; ++i) {
			if (this.xVel) {
				this.x += this.xVel * delta * tMlt
			}
			if (this.yVel) {
				this.y += this.yVel * delta * tMlt
			}
			tmpList = objectManager.getGridArrays(this.x, this.y, this.scale)
			const visitedObj = []
			for (var x = 0; x < tmpList.length; ++x) {
				for (var y = 0; y < tmpList[x].length; ++y) {
					if (!this.noClip && tmpList[x][y].active && !visitedObj.includes(tmpList[x][y].sid)) {
						visitedObj.push(tmpList[x][y].sid)
						objectManager.checkCollision(this, tmpList[x][y], tMlt)
					}
				}
			}
		}

		// PLAYER COLLISIONS:
		let tmpIndx = players.indexOf(this)
		for (let i = tmpIndx + 1; i < players.length; ++i) {
			if (!this.noClip && !players[i].noClip && players[i] != this && players[i].alive) {
				objectManager.checkCollision(this, players[i])
			}
		}

		// DECEL:
		if (this.xVel) {
			this.xVel *= mathPOW(config.playerDecel, delta)
			// if (this.xVel <= 0.01 && this.xVel >= -0.01) this.xVel = 0
		}
		if (this.yVel) {
			this.yVel *= mathPOW(config.playerDecel, delta)
			// if (this.yVel <= 0.01 && this.yVel >= -0.01) this.yVel = 0
		}

		// MAP BOUNDARIES:
		if (!this.noClip) {
			if (this.x - this.scale < 0) {
				this.x = this.scale
			} else if (this.x + this.scale > config.mapScale) {
				this.x = config.mapScale - this.scale
			}
			if (this.y - this.scale < 0) {
				this.y = this.scale
			} else if (this.y + this.scale > config.mapScale) {
				this.y = config.mapScale - this.scale
			}
		}

		// USE WEAPON OR TOOL:
		if (this.buildIndex < 0) {
			if (this.reloads[this.weaponIndex] > 0) {
				this.reloads[this.weaponIndex] -= delta
				this.gathering = this.mouseState
			} else if (this.gathering || this.autoGather) {
				var worked = true
				if (items.weapons[this.weaponIndex].gather != undefined) {
					this.gather(players)
				} else if (
					items.weapons[this.weaponIndex].projectile != undefined &&
					this.hasRes(items.weapons[this.weaponIndex], this.skin ? this.skin.projCost : 0)
				) {
					this.useRes(items.weapons[this.weaponIndex], this.skin ? this.skin.projCost : 0)
					this.noMovTimer = 0
					let tmpIndx = items.weapons[this.weaponIndex].projectile
					var projOffset = this.scale * 2
					var aMlt = this.skin && this.skin.aMlt ? this.skin.aMlt : 1
					if (items.weapons[this.weaponIndex].rec) {
						this.xVel -= items.weapons[this.weaponIndex].rec * mathCOS(this.dir)
						this.yVel -= items.weapons[this.weaponIndex].rec * mathSIN(this.dir)
					}
					projectileManager.addProjectile(
						this.x + projOffset * mathCOS(this.dir),
						this.y + projOffset * mathSIN(this.dir),
						this.dir,
						items.projectiles[tmpIndx].range * aMlt,
						items.projectiles[tmpIndx].speed * aMlt,
						tmpIndx,
						this,
						null,
						this.zIndex
					)
				} else {
					worked = false
				}
				if (worked) {
					// this.mouseState = false
					this.reloads[this.weaponIndex] = items.weapons[this.weaponIndex].speed * (this.skin ? this.skin.atkSpd || 1 : 1)
				}
				this.gathering = this.mouseState
			}
		}

		if (MODE === "HOCKEY" && this.sid === 1 && config.isStarted) {
			if (this.x - this.scale < 3000 + 43 || this.x + this.scale > 3000 + 43 + (40 - 2) * 43 * 2) {
				if (this.y - this.scale < 3000 + 43 + 6 * 43 * 2 || this.y + this.scale > 3000 + 43 + 12 * 43 * 2) {
					this.xVel = -this.xVel * 5
				} else if (this.x + this.scale < 3000 - 43) {
					Array.from(players).forEach((tmpPlayer) => {
						server.sendAll("ch", [tmpPlayer.sid, `Team 2 has won the game!`])
					})
					config.isStarted = false
				} else if (this.x - this.scale > 3000 + 43 + (40 - 1) * 43 * 2) {
					Array.from(players).forEach((tmpPlayer) => {
						server.sendAll("ch", [tmpPlayer.sid, `Team 1 has won the game!`])
					})
					config.isStarted = false
				}
			}
			if (
				((this.x + this.scale > 3000 - 43 && this.x - this.scale < 3000 + 43) ||
					(this.x + this.scale > 3000 + 43 + (40 - 2) * 43 * 2 && this.x - this.scale < 3000 + 43 + (40 - 1) * 43 * 2)) &&
				(this.y - this.scale < 3000 + 43 + 6 * 43 * 2 || this.y + this.scale > 3000 + 43 + 12 * 43 * 2)
			) {
				this.yVel = -this.yVel * 5
			} else if (this.y - this.scale < 3000 + 43 || this.y + this.scale > 3000 + 43 + (20 - 2) * 43 * 2) {
				this.yVel = -this.yVel * 5
			}
		}

		if (MODE === "HOCKEY" && this.sid !== 1) {
			if (this.x - this.scale < 3000 - 43) {
				this.x = this.scale + 3000 - 43
			} else if (this.x + this.scale > 3000 + 43 + (40 - 1) * 43 * 2) {
				this.x = 3000 + 43 + (40 - 1) * 43 * 2 - this.scale
			}
			if (this.y - this.scale < 3000 - 43) {
				this.y = this.scale + 3000 - 43
			} else if (this.y + this.scale > 3000 + 43 + (20 - 1) * 43 * 2) {
				this.y = 3000 + 43 + (20 - 1) * 43 * 2 - this.scale
			}
		}

		if (this.isBot) {
			setTimeout(() => {
				this.updateBot(delta);
			}, this.ping);
		}
	}

	// ADD WEAPON XP:
	this.addWeaponXP = function (amnt) {
		if (!this.weaponXP[this.weaponIndex]) {
			this.weaponXP[this.weaponIndex] = 0
		}
		this.weaponXP[this.weaponIndex] += amnt
	}

	// EARN XP:
	this.earnXP = function (amount) {
		if (this.age < config.maxAge) {
			this.XP += amount
			let reflect = false
			while (this.XP >= this.maxXP) {
				this.upgradePoints++
				reflect = true
				if (this.age < config.maxAge) {
					this.age++
					this.XP -= this.maxXP
					this.maxXP *= 1.2
				} 
				else {
					this.XP = this.maxXP
					break
				}
			}
			if (reflect) {
				server.send(this.id, "16", [this.upgradePoints, this.upgrAge])
				server.send(this.id, "15", [this.XP, UTILS.fixTo(this.maxXP, 1), this.age])
			}
			else {
				server.send(this.id, "15", [this.XP])
			}
		}
	}

	// CHANGE HEALTH:
	this.changeHealth = function (amount, reason, doer) {
		if (amount < 0 && this.invc) {
			return false
		}
		if (amount > 0 && this.health >= this.maxHealth) {
			return false
		}
		if (amount < 0 && this.skin) {
			amount *= this.skin.dmgMult || 1
		}
		if (amount < 0 && this.tail) {
			amount *= this.tail.dmgMult || 1
		}
		if (amount < 0) {
			this.hitTime = Date.now()
		}
		this.health += amount
		if (this.health > this.maxHealth) {
			amount -= this.health - this.maxHealth
			this.health = this.maxHealth
		}
		if (Math.round(this.health) <= 0) {
			// hack no slow heal caused death
			// if (this.isBot && this.shameTimer <= 0 && this.maxHealth - amount > 0) {
			// 	this.heal(this.maxHealth - this.health - amount)
			// }
			// else {
				this.kill(doer)
			// }
		}
		for (var i = 0; i < players.length; ++i) {
			if (this.sentTo[players[i].id]) {
				server.send(players[i].id, "h", [this.sid, Math.round(this.health)])
			}
		}
		if (doer && doer.canSee(this) && !(doer == this && amount < 0)) {
			server.send(doer.id, "t", [Math.round(this.x), Math.round(this.y), Math.round(-amount), 1])
		}

		if (this.isBot && amount < 0) {
			this.healBot(-amount, reason)
		}

		return true
	}

	// KILL:
	this.kill = function (doer) {
		if (!this.alive) return
		
		if (doer && doer.alive) {
			doer.kills++
			if (doer.skin && doer.skin.goldSteal) scoreCallback(doer, Math.round(this.points / 2))
			else scoreCallback(doer, Math.round(this.age * 100 * (doer.skin && doer.skin.kScrM ? doer.skin.kScrM : 1)))
			server.send(doer.id, "9", ["kills", doer.kills, 1])
		}
		this.alive = false
		server.send(this.id, "11")
		iconCallback()
	}

	// ADD RESOURCE:
	this.addResource = function (type, amount, auto) {
		if (!auto && amount > 0) {
			this.addWeaponXP(amount)
		}
		if (type == 3) {
			scoreCallback(this, amount, true)
		} else {
			this[config.resourceTypes[type]] += amount
			server.send(this.id, "9", [config.resourceTypes[type], this[config.resourceTypes[type]], 1])
		}
	}

	// CHANGE ITEM COUNT:
	this.changeItemCount = function (index, value) {
		this.itemCounts[index] = this.itemCounts[index] || 0
		this.itemCounts[index] += value
		server.send(this.id, "14", [index, this.itemCounts[index]])
	}

	// CHANGE ITEM ALL COUNT:
	this.changeItemAllCount = function (index, value) {
		this.itemCounts[index] = value
		server.send(this.id, "14", [index, this.itemCounts[index]])
	}

	// BUILD:
	this.buildItem = function (item) {
		var tmpS = this.scale + item.scale + (item.placeOffset || 0)
		var tmpX = this.x + tmpS * mathCOS(this.dir)
		var tmpY = this.y + tmpS * mathSIN(this.dir)
		if (
			this.canBuild(item) &&
			!(item.consume && this.skin && this.skin.noEat) &&
			(item.consume || objectManager.checkItemLocation(tmpX, tmpY, item.scale, 0.6, item.id, false, this))
		) {
			var worked = false
			if (item.consume) {
				if (this.hitTime) {
					var timeSinceHit = Date.now() - this.hitTime
					this.hitTime = 0
					if (timeSinceHit <= 120) {
						this.shameCount++
						if (this.shameCount >= 8) {
							this.shameTimer = 30000
							this.shameCount = 0
						}
					} else {
						this.shameCount -= 2
						if (this.shameCount <= 0) {
							this.shameCount = 0
						}
					}
				}
				if (this.shameTimer <= 0) {
					worked = item.consume(this)
				}
			} else {
				worked = true
				if (item.group.limit) {
					this.changeItemCount(item.group.id, 1)
				}
				if (item.pps) {
					this.pps += item.pps
				}
				objectManager.add(objectManager.objects.length, tmpX, tmpY, this.dir, item.scale, item.type, item, false, this)
			}
			if (worked) {
				this.useRes(item)
				this.buildIndex = -1
			}
		}
	}

	// HAS RESOURCES:
	this.hasRes = function (item, mult) {
		for (var i = 0; i < item.req.length; ) {
			if (this[item.req[i]] < Math.round(item.req[i + 1] * (mult || 1))) {
				return false
			}
			i += 2
		}
		return true
	}

	// USE RESOURCES:
	this.useRes = function (item, mult) {
		if (config.inSandbox) {
			return
		}
		for (var i = 0; i < item.req.length; ) {
			this.addResource(config.resourceTypes.indexOf(item.req[i]), -Math.round(item.req[i + 1] * (mult || 1)))
			i += 2
		}
	}

	// CAN BUILD:
	this.canBuild = function (item) {
		if (this.admin) return true

		let limit = config.inSandbox ? item.group.limitSandbox : item.group.limit

		if (limit && this.itemCounts[item.group.id] >= limit) {
			return false
		}
		return config.inSandbox ? true : this.hasRes(item)
	}

	// GATHER:
	this.gather = function () {
		// SHOW:
		this.noMovTimer = 0

		// SLOW MOVEMENT:
		this.slowMult -= items.weapons[this.weaponIndex].hitSlow || 0.3
		if (this.slowMult < 0) {
			this.slowMult = 0
		}

		// VARIANT DMG:
		var tmpVariant = config.fetchVariant(this)
		var applyPoison = tmpVariant.poison
		var variantDmg = tmpVariant.val

		// CHECK IF HIT GAME OBJECT:
		var hitObjs = {}
		var tmpDist, tmpDir, tmpObj, hitSomething
		var tmpList = objectManager.getGridArrays(this.x, this.y, items.weapons[this.weaponIndex].range)
		if (config.canHitObj) {
			for (var t = 0; t < tmpList.length; ++t) {
				for (let i = 0; i < tmpList[t].length; ++i) {
					tmpObj = tmpList[t][i]
					if (tmpObj.active && !tmpObj.dontGather && !hitObjs[tmpObj.sid] && tmpObj.visibleToPlayer(this)) {
						tmpDist = UTILS.getDistance(this.x, this.y, tmpObj.x, tmpObj.y) - tmpObj.scale
						if (tmpDist <= items.weapons[this.weaponIndex].range) {
							tmpDir = UTILS.getDirection(tmpObj.x, tmpObj.y, this.x, this.y)
							if (UTILS.getAngleDist(tmpDir, this.dir) <= config.gatherAngle) {
								hitObjs[tmpObj.sid] = 1
								if ((this.destroyMode && tmpObj.type != 4) || tmpObj.health) {
									if (
										this.destroyMode ||
										tmpObj.changeHealth(
											-items.weapons[this.weaponIndex].dmg * variantDmg * (items.weapons[this.weaponIndex].sDmg || 1) * (this.skin?.bDmg ?? 1),
											"hit",
											this
										)
									) {
										if (tmpObj.req) {
											for (var x = 0; x < tmpObj.req.length; ) {
												this.addResource(config.resourceTypes.indexOf(tmpObj.req[x]), tmpObj.req[x + 1])
												x += 2
											}
										}
										objectManager.disableObj(tmpObj)
										server.sendAll("12", [tmpObj.sid])
									}
								} else {
									this.earnXP(4 * items.weapons[this.weaponIndex].gather)
									var count = items.weapons[this.weaponIndex].gather + (tmpObj.type == 3 ? 4 : 0)
									if (this.skin && this.skin.extraGold) {
										this.addResource(3, 1)
									}
									if (tmpObj.type == 4) {
										this.addResource(2, 5)
										this.addResource(3, 5)
									}
									else {
										this.addResource(tmpObj.type, count)
									}
								}
								hitSomething = true
								objectManager.hitObj(tmpObj, tmpDir)
							}
						}
					}
				}
			}
		}

		// CHECK IF HIT PLAYER:
		for (let i = 0; i < players.length + ais.length; ++i) {
			tmpObj = players[i] || ais[i - players.length]
			if (tmpObj != this && tmpObj.alive && !(tmpObj.team && tmpObj.team == this.team)) {
				tmpDist = UTILS.getDistance(this.x, this.y, tmpObj.x, tmpObj.y) - tmpObj.scale * 1.8
				if (tmpDist <= items.weapons[this.weaponIndex].range) {
					tmpDir = UTILS.getDirection(tmpObj.x, tmpObj.y, this.x, this.y)
					if (UTILS.getAngleDist(tmpDir, this.dir) <= config.gatherAngle) {
						// STEAL RESOURCES:
						var stealCount = items.weapons[this.weaponIndex].steal
						if (stealCount && tmpObj.addResource) {
							stealCount = Math.min(tmpObj.points || 0, stealCount)
							this.addResource(3, stealCount)
							tmpObj.addResource(3, -stealCount)
						}

						// MELEE HIT PLAYER:

						var dmgMlt = variantDmg
						if (
							tmpObj.weaponIndex != undefined &&
							items.weapons[tmpObj.weaponIndex].shield &&
							UTILS.getAngleDist(tmpDir + Math.PI, tmpObj.dir) <= config.shieldAngle
						) {
							dmgMlt = items.weapons[tmpObj.weaponIndex].shield
						}
						var dmgVal =
							this.customDmg ||
							items.weapons[this.weaponIndex].dmg *
								(this.skin && this.skin.dmgMultO ? this.skin.dmgMultO : 1) *
								(this.tail && this.tail.dmgMultO ? this.tail.dmgMultO : 1)
						var tmpSpd = 0.3 * (tmpObj.weightM || 1) + (items.weapons[this.weaponIndex].knock || 0)
						if (MODE !== "HOCKEY") {
							tmpObj.xVel += tmpSpd * mathCOS(tmpDir)
							tmpObj.yVel += tmpSpd * mathSIN(tmpDir)
						}
						if (MODE === "HOCKEY" && tmpObj.sid === 1) {
							tmpObj.xVel += tmpSpd * mathCOS(tmpDir) * 1.2
							tmpObj.yVel += tmpSpd * mathSIN(tmpDir) * 1.2
							tmpObj.dir = tmpDir
						}
						if (this.skin && this.skin.healD) {
							this.changeHealth(dmgVal * dmgMlt * this.skin.healD, "hit", this)
						}
						if (this.tail && this.tail.healD) {
							this.changeHealth(dmgVal * dmgMlt * this.tail.healD, "hit", this)
						}
						if (tmpObj.skin && tmpObj.skin.dmg && dmgMlt == 1) {
							this.changeHealth(-dmgVal * tmpObj.skin.dmg, "hit", tmpObj)
						}
						if (tmpObj.tail && tmpObj.tail.dmg && dmgMlt == 1) {
							this.changeHealth(-dmgVal * tmpObj.tail.dmg, "hit", tmpObj)
						}
						if (MODE !== "HOCKEY" && tmpObj.dmgOverTime && this.skin && this.skin.poisonDmg && !(tmpObj.skin && tmpObj.skin.poisonRes)) {
							tmpObj.dmgOverTime.dmg = this.skin.poisonDmg
							tmpObj.dmgOverTime.time = this.skin.poisonTime || 1
							tmpObj.dmgOverTime.doer = this
						}
						if (MODE !== "HOCKEY" && tmpObj.dmgOverTime && applyPoison && !(tmpObj.skin && tmpObj.skin.poisonRes)) {
							tmpObj.dmgOverTime.dmg = 5
							tmpObj.dmgOverTime.time = 5
							tmpObj.dmgOverTime.doer = this
						}
						if (tmpObj.skin && tmpObj.skin.dmgK) {
							this.xVel -= tmpObj.skin.dmgK * mathCOS(tmpDir)
							this.yVel -= tmpObj.skin.dmgK * mathSIN(tmpDir)
						}
						if (MODE !== "HOCKEY") {
							tmpObj.changeHealth(-dmgVal * dmgMlt, "hit", this, this)
						}
					}
				}
			}
		}

		// SEND FOR ANIMATION:
		this.sendAnimation(hitSomething ? 1 : 0)
	}

	// SEND ANIMATION:
	this.sendAnimation = function (hit) {
		for (var i = 0; i < players.length; ++i) {
			if (this.sentTo[players[i].id] && this.canSee(players[i])) {
				server.send(players[i].id, "7", [this.sid, hit ? 1 : 0, this.weaponIndex])
			}
		}
	}

	// ANIMATE:
	var tmpRatio = 0
	var animIndex = 0
	this.animate = function (delta) {
		if (this.animTime > 0) {
			this.animTime -= delta
			if (this.animTime <= 0) {
				this.animTime = 0
				this.dirPlus = 0
				tmpRatio = 0
				animIndex = 0
			} else {
				if (animIndex == 0) {
					tmpRatio += delta / (this.animSpeed * config.hitReturnRatio)
					this.dirPlus = UTILS.lerp(0, this.targetAngle, Math.min(1, tmpRatio))
					if (tmpRatio >= 1) {
						tmpRatio = 1
						animIndex = 1
					}
				} else {
					tmpRatio -= delta / (this.animSpeed * (1 - config.hitReturnRatio))
					this.dirPlus = UTILS.lerp(0, this.targetAngle, Math.max(0, tmpRatio))
				}
			}
		}
	}

	// GATHER ANIMATION:
	this.startAnim = function (didHit, index) {
		this.animTime = this.animSpeed = items.weapons[index].speed
		this.targetAngle = didHit ? -config.hitAngle : -Math.PI
		tmpRatio = 0
		animIndex = 0
	}

	// CAN SEE:
	this.canSee = function (other) {
		if (!other) return false
		if (other.skin && other.skin.invisTimer && other.noMovTimer >= other.skin.invisTimer) return false
		var dx = mathABS(other.x - this.x) - other.scale
		var dy = mathABS(other.y - this.y) - other.scale
		return dx <= (config.maxScreenWidth / 2) * 1.3 && dy <= (config.maxScreenHeight / 2) * 1.3
	}
}
