beforeEach(() => {
  cy.task("resetQa", null, { log: false });
});

Cypress.Commands.add("loginQa", (options = {}) => {
  cy.visit("/login");
  cy.task("credentials", options, { log: false }).then(({ email, password }) => {
    cy.get('input[name="email"]').type(email);
    cy.get('input[name="password"]').type(password, { log: false });
  });
  cy.contains("button", "Continuar").click();
  cy.get('input[name="code"]').should("be.visible");
  cy.task("otp", options, { log: false }).then(code => cy.get('input[name="code"]').type(code, { log: false }));
  cy.contains("button", "Verificar y entrar").click();
  cy.contains("button", "Confirmo que los guardé").click();
  cy.location("pathname").should("equal", "/");
  cy.get('.shell[data-hydrated="true"]').should("exist");
  cy.get("body").then(body => {
    if (body.find(".guide-backdrop").length) cy.contains("button", "Comenzar").click();
  });
});
