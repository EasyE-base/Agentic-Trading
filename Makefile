COMPOSE=docker compose

up:
	$(COMPOSE) up -d

down:
	$(COMPOSE) down

ps:
	$(COMPOSE) ps

logs:
	$(COMPOSE) logs -f --tail=200

restart:
	$(COMPOSE) down && $(COMPOSE) up -d

clean:
	$(COMPOSE) down -v
