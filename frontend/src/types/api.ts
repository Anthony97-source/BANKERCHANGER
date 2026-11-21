/**
 * TypeScript types generated from backend/openapi.yaml.
 *
 * Regenerate with:
 *   npx openapi-typescript ../backend/openapi.yaml -o src/types/api.ts
 *
 * CI verifies this file is up to date whenever backend/openapi.yaml changes.
 */

export interface paths {
  "/health": {
    get: operations["health_check"];
  };
  "/api/v1/config": {
    get: operations["get_config"];
    put: operations["update_config"];
  };
  "/api/v1/strategies": {
    get: operations["list_strategies"];
  };
  "/api/v1/strategies/{strategy_id}": {
    get: operations["get_strategy"];
  };
  "/api/v1/positions": {
    get: operations["list_positions"];
  };
  "/api/v1/orders": {
    get: operations["list_orders"];
    post: operations["create_order"];
  };
  "/api/v1/orders/{order_id}": {
    get: operations["get_order"];
    delete: operations["cancel_order"];
  };
  "/api/v1/portfolio": {
    get: operations["get_portfolio"];
  };
}

export interface components {
  schemas: {
    HealthResponse: {
      status: string;
      version?: string;
      timestamp?: string;
    };
    Config: {
      [key: string]: unknown;
    };
    ConfigUpdate: {
      [key: string]: unknown;
    };
    Strategy: {
      id: string;
      name: string;
      description?: string | null;
      enabled: boolean;
      parameters?: { [key: string]: unknown };
    };
    Position: {
      id: string;
      symbol: string;
      quantity: number;
      entry_price: number;
      current_price?: number | null;
      unrealized_pnl?: number | null;
      side?: "long" | "short";
    };
    Order: {
      id: string;
      symbol: string;
      side: "buy" | "sell";
      order_type: "market" | "limit" | "stop" | "stop_limit";
      quantity: number;
      price?: number | null;
      status: "pending" | "open" | "filled" | "partially_filled" | "cancelled" | "rejected";
      created_at?: string;
    };
    OrderCreate: {
      symbol: string;
      side: "buy" | "sell";
      order_type: "market" | "limit" | "stop" | "stop_limit";
      quantity: number;
      price?: number | null;
    };
    Portfolio: {
      total_value: number;
      cash: number;
      positions_value?: number;
      daily_pnl?: number;
      total_pnl?: number;
    };
    HTTPValidationError: {
      detail?: components["schemas"]["ValidationError"][];
    };
    ValidationError: {
      loc: (string | number)[];
      msg: string;
      type: string;
    };
  };
}

export interface operations {
  health_check: {
    responses: {
      200: {
        content: {
          "application/json": components["schemas"]["HealthResponse"];
        };
      };
    };
  };
  get_config: {
    responses: {
      200: {
        content: {
          "application/json": components["schemas"]["Config"];
        };
      };
    };
  };
  update_config: {
    requestBody: {
      content: {
        "application/json": components["schemas"]["ConfigUpdate"];
      };
    };
    responses: {
      200: {
        content: {
          "application/json": components["schemas"]["Config"];
        };
      };
      422: {
        content: {
          "application/json": components["schemas"]["HTTPValidationError"];
        };
      };
    };
  };
  list_strategies: {
    responses: {
      200: {
        content: {
          "application/json": components["schemas"]["Strategy"][];
        };
      };
    };
  };
  get_strategy: {
    parameters: {
      path: {
        strategy_id: string;
      };
    };
    responses: {
      200: {
        content: {
          "application/json": components["schemas"]["Strategy"];
        };
      };
      404: {
        content: {
          "application/json": components["schemas"]["HTTPValidationError"];
        };
      };
    };
  };
  list_positions: {
    responses: {
      200: {
        content: {
          "application/json": components["schemas"]["Position"][];
        };
      };
    };
  };
  list_orders: {
    responses: {
      200: {
        content: {
          "application/json": components["schemas"]["Order"][];
        };
      };
    };
  };
  create_order: {
    requestBody: {
      content: {
        "application/json": components["schemas"]["OrderCreate"];
      };
    };
    responses: {
      201: {
        content: {
          "application/json": components["schemas"]["Order"];
        };
      };
      422: {
        content: {
          "application/json": components["schemas"]["HTTPValidationError"];
        };
      };
    };
  };
  get_order: {
    parameters: {
      path: {
        order_id: string;
      };
    };
    responses: {
      200: {
        content: {
          "application/json": components["schemas"]["Order"];
        };
      };
      404: {
        content: {
          "application/json": components["schemas"]["HTTPValidationError"];
        };
      };
    };
  };
  cancel_order: {
    parameters: {
      path: {
        order_id: string;
      };
    };
    responses: {
      200: {
        content: {
          "application/json": components["schemas"]["Order"];
        };
      };
      404: {
        content: {
          "application/json": components["schemas"]["HTTPValidationError"];
        };
      };
    };
  };
  get_portfolio: {
    responses: {
      200: {
        content: {
          "application/json": components["schemas"]["Portfolio"];
        };
      };
    };
  };
}

export type ApiSchemas = components["schemas"];
export type ApiOperations = operations;
