const origin = "https://localhost:3444";
const request = (method, url, body) => cy.request({ method, url, body, headers: { origin }, failOnStatusCode: false });

describe("Acceso y seguridad", () => {
  it("impide que un verificador vea o edite otra área y administre usuarios", () => {
    cy.task("seedSurvey", { area: "Recepción" }).as("ownSurvey");
    cy.task("seedSurvey", { area: "Restaurantes" }).as("otherSurvey");
    cy.loginQa({ verifier: true });
    cy.get("@ownSurvey").then(id => cy.request(`/api/surveys/${id}/file`).its("status").should("equal", 200));
    cy.get("@otherSurvey").then(id => {
      cy.request({ url: `/api/surveys/${id}/file`, failOnStatusCode: false }).its("status").should("equal", 404);
      request("PATCH", `/api/surveys/${id}/data`, {}).its("status").should("equal", 404);
    });
    request("POST", "/api/admin/users", {}).its("status").should("equal", 403);
    cy.request({ url: "/api/surveys/no-es-id/file", failOnStatusCode: false }).its("status").should("equal", 404);
  });
  it("protege páginas, originales y exportaciones sin sesión", () => {
    cy.visit("/");
    cy.location("pathname").should("equal", "/login");
    for (const url of ["/api/export", "/api/reports/export", "/api/surveys/1/file", "/api/auth/session"])
      cy.request({ url, failOnStatusCode: false }).its("status").should("equal", 401);
    cy.request("/api/health").then(response => {
      expect(response.body.status).to.equal("healthy");
      expect(response.headers["x-content-type-options"]).to.equal("nosniff");
      expect(response.headers["x-frame-options"]).to.equal("DENY");
    });
  });
  it("rechaza origen externo, JSON inválido y bloquea intentos repetidos", () => {
    cy.request({ method: "POST", url: "/api/auth/login", headers: { origin: "https://evil.example" }, body: {}, failOnStatusCode: false }).its("status").should("equal", 403);
    cy.request({ method: "POST", url: "/api/auth/login", headers: { origin, "content-type": "application/json" }, body: "{", failOnStatusCode: false }).its("status").should("equal", 400);
    for (let i = 0; i < 5; i++)
      request("POST", "/api/auth/login", { email: "qa-invalid@example.test", password: "incorrecta" }).its("status").should("equal", 401);
    request("POST", "/api/auth/login", { email: "qa-invalid@example.test", password: "incorrecta" }).its("status").should("equal", 429);
  });
  it("exige MFA real, permite navegar y revoca la sesión al salir", () => {
    cy.loginQa();
    cy.getCookies().then(cookies => {
      const session = cookies.find(cookie => ["irtra_session", "__Host-irtra_session"].includes(cookie.name));
      expect(session.httpOnly).to.equal(true);
      expect(session.secure).to.equal(true);
      expect(session.sameSite).to.equal("strict");
    });
    for (const page of ["/", "/carga", "/encuestas", "/reportes", "/reportes/ejecutivo", "/acciones", "/alertas", "/areas", "/usuarios", "/seguridad"]) {
      cy.visit(page);
      if (page !== "/reportes/ejecutivo") cy.get('.shell[data-hydrated="true"]').should("exist");
      cy.get("h1").should("be.visible");
      cy.contains("Application error").should("not.exist");
    }
    cy.contains("button", "Salir").click();
    cy.location("pathname").should("equal", "/login");
    cy.request({ url: "/api/auth/session", failOnStatusCode: false }).its("status").should("equal", 401);
  });
});

describe("Encuestas y Excel", () => {
  it("registra seguimiento, recuperación, plan financiero y eliminación auditada", () => {
    cy.task("seedSurvey").then(id => {
      cy.loginQa();
      request("POST", `/api/surveys/${id}/followups`, { status: "Cerrado", comment: "No debe cerrar sin revisar" }).its("status").should("equal", 409);
      request("POST", `/api/surveys/${id}/followups`, { status: "En atención", comment: "Atención registrada por QA" }).its("status").should("equal", 200);
      for (const satisfaction_after of [0, 6, 2.5, "texto"])
        request("POST", `/api/surveys/${id}/recovery`, { status: "Recuperado", contact_summary: "Prueba de validación", satisfaction_after }).its("status").should("equal", 400);
      request("POST", `/api/surveys/${id}/recovery`, { status: "Recuperado", contact_channel: "Presencial", contact_summary: "Se resolvió el caso", satisfaction_after: 5 }).its("status").should("equal", 201);
      cy.task("areaIds").then(areas => {
        request("POST", "/api/actions", { title: "Plan de prueba", priority: "Medio", survey_id: id, area_id: areas[0], estimated_savings: 100 }).then(response => {
          expect(response.status).to.equal(201);
          const plan = response.body.id;
          for (const actual_savings of [-1, "texto"])
            request("PATCH", `/api/actions/${plan}/finance`, { financial_status: "Validado", financial_note: "Revisión de evidencia", actual_savings }).its("status").should("equal", 400);
          request("PATCH", `/api/actions/${plan}/finance`, { financial_status: "Validado", financial_note: "Evidencia verificada", actual_savings: 75 }).its("status").should("equal", 200);
        });
      });
      request("POST", `/api/surveys/${id}/validation`, { action: "confirm", reason: "Cotejo final de QA" }).its("status").should("equal", 200);
      request("POST", `/api/surveys/${id}/followups`, { status: "Cerrado", comment: "Caso resuelto y verificado" }).its("status").should("equal", 200);
      request("POST", `/api/surveys/${id}/deletion`, { action: "request", reason: "Eliminar prueba sintética" }).its("status").should("equal", 200);
      request("POST", `/api/surveys/${id}/deletion`, { action: "approve", reason: "Prueba terminada y autorizada" }).its("status").should("equal", 200);
      cy.task("survey", id).should("equal", null);
      cy.task("auditActions", id).should("include.members", ["CASE_FOLLOWUP", "GUEST_RECOVERY_RECORDED", "SURVEY_CONFIRM", "DELETION_REQUEST", "DELETION_APPROVE"]);
    });
  });
  it("edita desde el formulario, confirma y descarga XLSM/XLSX con datos exactos", () => {
    cy.task("seedSurvey").then(id => {
      cy.loginQa();
      cy.visit(`/encuestas/${id}`);
      cy.get('.shell[data-hydrated="true"]').should("exist");
      cy.contains("button", "Ver campos editables").click();
      cy.get('input[name="document_number"]').should("have.value", "000018");
      cy.get('input[name="visitor_name"]').clear().type("Visitante de prueba");
      cy.get('input[name="affiliate_status"]').clear().type("Sí");
      cy.get('input[name="visit_date"]').clear().type("15/01/2099");
      cy.get('select[name="origin_place"]').select("Spa");
      cy.get('select[name="hotelId"]').select("SAN_MARTIN");
      cy.get('select[name="restauranteId"]').select("LA_HACIENDA");
      cy.get('textarea[name="item_7"]').clear().type("Sí");
      cy.get('input[name="service:Calidad de comida"][value="Bueno"]').check();
      cy.get('.survey-editor textarea[name="reason"]').type("Verificado contra boleta sintética");
      cy.intercept("PATCH", `/api/surveys/${id}/data`).as("save");
      cy.contains("button", "Guardar todos los cambios").click();
      cy.wait("@save").its("response.statusCode").should("equal", 200);
      cy.task("survey", id).then(row => {
        expect(row.validation_status).to.equal("En revisión");
        expect(row.needs_review).to.equal(1);
        expect(JSON.parse(row.extracted_data).general_data.document_number).to.equal("000018");
        expect(row.restaurant).to.equal("LA HACIENDA");
        expect(row.hotel).to.equal("SAN MARTIN");
      });
      // Reload explicitly; do not depend on the UI's delayed refresh.
      cy.reload();
      cy.get('textarea[placeholder="Motivo de confirmación, reapertura o reanálisis"]').type("Cotejado con el documento original");
      cy.intercept("POST", `/api/surveys/${id}/validation`).as("confirm");
      cy.contains("button", "Confirmar encuesta").click();
      cy.wait("@confirm").its("response.statusCode").should("equal", 200);
      cy.task("survey", id).its("validation_status").should("equal", "Confirmada");
      cy.visit("/encuestas");
      for (const [endpoint, filename, statistical] of [
        ["/api/export", "INFORME GERENCIAL 2099-01-01 a 2099-01-31.xlsm", false],
        ["/api/reports/export", "REPORTE ESTADISTICO 2099-01-01 a 2099-01-31.xlsx", true],
      ]) {
        cy.document().then(doc => {
          const link = doc.createElement("a");
          link.href = `${endpoint}?from=2099-01-01&to=2099-01-31`;
          doc.body.appendChild(link); link.click(); link.remove();
        });
        cy.readFile(`${Cypress.config("downloadsFolder")}/${filename}`, null, { timeout: 120000 }).should("have.length.greaterThan", 1000);
        cy.task("verifyDownload", { filename, statistical }, { timeout: 120000 }).its("valid").should("equal", true);
      }
      request("POST", `/api/surveys/${id}/validation`, { action: "reopen", reason: "Revisión adicional controlada" }).its("status").should("equal", 200);
      cy.task("survey", id).its("needs_review").should("equal", 1);
      cy.task("auditActions", id).should("include.members", ["EXTRACTED_DATA_EDIT", "SURVEY_CONFIRM", "SURVEY_REOPEN"]);
    });
  });
  it("rechaza archivos falsos y recibe imágenes sin inventar extracciones", () => {
    cy.loginQa();
    cy.visit("/carga");
    cy.get('input[type="file"]').selectFile({ contents: Cypress.Buffer.from("no es imagen"), fileName: "falsa.png", mimeType: "image/png" });
    cy.intercept("POST", "/api/surveys").as("upload");
    cy.contains("button", "Procesar encuestas").click();
    cy.wait("@upload").its("response.statusCode").should("equal", 400);
    cy.task("imageFixture").then(base64 => {
      cy.get('input[type="file"]').selectFile({ contents: Cypress.Buffer.from(base64, "base64"), fileName: "qa-imagen.png", mimeType: "image/png" });
      cy.contains("button", "Procesar encuestas").click();
      cy.wait("@upload").then(({ response }) => {
        expect(response.statusCode).to.equal(201);
        expect(response.body.created).to.equal(1);
      });
    });
    cy.task("latestSurvey").then(row => {
      expect(row.needs_review).to.equal(1);
      expect(row.confidence).to.equal(0);
      expect(row.validation_status).to.equal("Pendiente de revisión");
      expect(JSON.parse(row.extracted_data).numbered_answers).to.deep.equal({});
    });
  });
  it("rechaza fechas imposibles y ediciones inválidas sin cambiar el registro", () => {
    cy.task("seedSurvey").then(id => {
      cy.loginQa();
      for (const endpoint of ["/api/export", "/api/reports/export"])
        for (const query of ["from=2099-02-31&to=2099-03-01", "from=2099-03-01&to=2099-01-01"])
          cy.request({ url: `${endpoint}?${query}`, failOnStatusCode: false }).its("status").should("equal", 400);
      request("PATCH", `/api/surveys/${id}/data`, { general: {}, numbered: {}, ratings: "incorrecto", origin_place: "Spa", reason: "No debe guardarse" }).its("status").should("equal", 400);
      cy.task("survey", id).its("validation_status").should("equal", "Pendiente de revisión");
    });
  });
});
