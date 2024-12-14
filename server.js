// Подключение необходимых модулей
var app = require('http').createServer(handler), // Создание HTTP-сервера
	io = require('socket.io').listen(app), // Подключение WebSocket
	fs = require("fs"), // Работа с файловой системой
	url = require("url"), // Парсинг URL
	port = process.env.PORT || 3001, // Задание порта сервера
	//host = '0.0.0.0', // Задание IP-адреса сервера
	queue = { // Очередь игроков по цветам
		'W': [], // Очередь белых
		'B': [], // Очередь черных
		'U': []  // Очередь неопределенных
	};

// // Запуск HTTP-сервера на заданном IP-адресе и порту
// app.listen(port, host, () => {
//     console.log(`HTTP server listening on ${host}:${port}`);
// });


app.listen(port);

// Функция-обработчик запросов HTTP-сервера
function handler(req, resp) {
	var r_url = url.parse(req.url); // Парсинг URL запроса
	if (r_url.pathname.substring(1) === "getport") {
		// Возвращаем порт сервера
		resp.writeHead(200, { "Content-Type": "text/plain" });
		resp.write("" + port);
		resp.end();
	} else if (r_url.pathname === "/") {
		// Отправка клиентского интерфейса
		resp.writeHead(200, { "Content-Type": "text/html" });
		var clientui = fs.readFileSync("chess.html");
		resp.write(clientui);
		resp.end();
	} else {
		// Работа с файлами на сервере
		var filename = r_url.pathname.substring(1),
			type;

		// Определение MIME-типов файлов
		switch (filename.substring(filename.lastIndexOf(".") + 1)) {
			case "html":
			case "htm":
				type = "text/html; charset=UTF-8";
				break;
			case "js":
				type = "application/javascript; charset=UTF-8";
				break;
			case "css":
				type = "text/css; charset=UTF-8";
				break;
			case "svg":
				type = "image/svg+xml";
				break;
			case "png":
				type = "image/png";
				break;
			default:
				type = "application/octet-stream";
				break;
		}

		// Чтение и отправка файлов
		fs.readFile(filename, function (err, content) {
			if (err) {
				// Ошибка: файл не найден
				resp.writeHead(404, {
					"Content-Type": "text/plain; charset=UTF-8"
				});
				resp.write(err.message);
				resp.end();
			} else {
				resp.writeHead(200, {
					"Content-Type": type
				});
				resp.write(content);
				resp.end();
			}
		});
	}
}


/* Веб-сервер WebSocket
	 Все данные передаются в формате JSON
*/

// Класс GameList для управления списком игр
var GameList = (function () {
	// Класс Node: узел связного списка
	var Node = function (obj, next) {
		this.obj = obj; // Объект, содержащийся в узле
		this.next = next; // Ссылка на следующий узел
	};
	var that = {},
		rear = null, // Последний узел в списке
		size = 0, // Размер списка
		unique = 0; // Уникальный идентификатор игр

	// Метод добавления новой игры
	that.addGame = function (white, black) {
		if (rear == null) {
			// Если список пуст
			rear = new Node(new Game(white, black, unique), null);
			rear.next = rear;
		} else {
			// Добавление узла в конец списка
			var newNode = new Node(new Game(white, black, unique), rear.next);
			rear.next = newNode;
			rear = newNode;
		}
		size++;
		unique++;
		that.showGames(); // Вывод списка игр
	};

	// Метод удаления игры
	that.removeGame = function (gid) {
		console.log("Removing game" + gid);
		if (rear == null) {
			// Если список пуст
			console.log("Problem -- removing game from null list");
			return;
		}

		var ptr = rear.next, prev = rear;
		if (ptr == null) return;

		// Поиск и удаление игры по идентификатору
		do {
			if (ptr.obj.gid == gid) {
				console.log("Removing game " + gid);
				if (ptr.next == ptr) {
					rear = null; // Список становится пустым
				} else {
					prev.next = ptr.next;
					ptr.next = null;
					if (ptr == rear) {
						rear = prev;
					}
				}
				size--;
				that.showGames(); // Вывод списка игр
				return;
			}
			prev = ptr;
			ptr = ptr.next;
		} while (ptr != rear.next);
	};

	// Метод отображения списка игр
	that.showGames = function () {
		if (rear == null) {
			console.log("List empty");
			return;
		}
		var ptr = rear.next;
		var str = "Game List:\n";
		do {
			str += ptr.obj.gid + " ";
			ptr = ptr.next;
		} while (ptr != rear.next)
		console.log(str);
	};
	return that;
}());

// Класс Game для управления одной игрой
var Game = function (w, b, gid) {
	var that = this,
		disconnected = false; // Статус отключения

	// Игроки
	that.wPlayer = w;
	that.bPlayer = b;
	that.gid = gid; // Уникальный идентификатор игры
	that.waitingForPromotion = false;

	console.log("Game started");

	// Обработка событий отключения игроков
	that.wPlayer.removeAllListeners('disconnect');
	that.bPlayer.removeAllListeners('disconnect');

	that.wPlayer.on('disconnect', function () {
		if (that.bPlayer != null) {
			that.bPlayer.emit('partnerDisconnect');
		}
		that.wPlayer = null;
		that.destroy();
	});

	that.bPlayer.on('disconnect', function () {
		if (that.wPlayer != null) {
			that.wPlayer.emit('partnerDisconnect');
		}
		that.bPlayer = null;
		that.destroy();
	});

	// Обработка сообщений в чате
	that.wPlayer.on('chat', function (data) {
		if (!disconnected) {
			that.bPlayer.emit('chat', data);
		}
	});

	that.bPlayer.on('chat', function (data) {
		if (!disconnected) {
			that.wPlayer.emit('chat', data);
		}
	});

	// Обработка ходов игроков
	that.wPlayer.on('movemade', function (data) {
		console.log("White player made a move");
		if (!disconnected) {
			that.bPlayer.emit('opposing_move', data);
		}
	});
	that.bPlayer.on('movemade', function (data) {
		console.log("Black player made a move");
		if (!disconnected) {
			that.wPlayer.emit('opposing_move', data);
		}
	});

	// Метод уничтожения игры
	that.destroy = function () {
		disconnected = true;
		if (that.wPlayer == null && that.bPlayer == null) {
			GameList.removeGame(that.gid); // Удаление игры из списка
		}
	};

	// Инициализация игры
	that.init();

	return that;
};

// Методы прототипа Game
Game.prototype = {
	wPlayer: null,
	bPlayer: null,
	init: function () {
		// Отправка информации о матче игрокам
		this.wPlayer.emit("matchfound", {
			color: 'W'
		});
		this.bPlayer.emit("matchfound", {
			color: 'B'
		});
	}
};

// Обработка соединений WebSocket
io.sockets.on('connection', function (sk) {
	var w = null,
		b = null,
		skColor = false; // Цвет игрока
	console.log("web socket connection received");

	// Обработка установки параметров игрока
	sk.on('setup', function (data) {
		sk.on('disconnect', function () {
			if (!!queue[skColor]) {
				var index = queue[skColor].indexOf(sk);
				console.log("Removing player from queue");
				queue[skColor].splice(index, 1); // Удаление игрока из очереди
			}
		});
		console.log(data);
		skColor = data.color;
		if (!skColor) { skColor = 'U'; } // Цвет по умолчанию - неопределенный

		// Добавление игрока в очередь или начало игры
		if (skColor == 'W') {
			if (queue['B'].length > 0) {
				b = queue['B'].shift();
				GameList.addGame(sk, b); // Начало новой игры
			} else if (queue['U'].length > 0) {
				b = queue['U'].shift();
				GameList.addGame(sk, b); // Начало новой игры
			} else {
				queue['W'].push(sk); // Добавление в очередь белых
			}
		} else if (skColor == 'B') {
			if (queue['W'].length > 0) {
				w = queue['W'].shift();
				GameList.addGame(w, sk); // Начало новой игры
			} else if (queue['U'].length > 0) {
				w = queue['U'].shift();
				GameList.addGame(w, sk); // Начало новой игры
			} else {
				queue['B'].push(sk); // Добавление в очередь черных
			}
		} else {
			if (queue['W'].length > 0) {
				w = queue['W'].shift();
				GameList.addGame(w, sk); // Начало новой игры
			} else if (queue['B'].length > 0) {
				b = queue['B'].shift();
				GameList.addGame(sk, b); // Начало новой игры
			} else if (queue['U'].length > 0) {
				w = queue['U'].shift();
				GameList.addGame(w, sk); // Начало новой игры
			} else {
				queue['U'].push(sk); // Добавление в очередь неопределенных
			}
		}
	});
});
