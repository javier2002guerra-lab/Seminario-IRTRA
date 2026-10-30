import importlib.util
import unittest

spec = importlib.util.spec_from_file_location("fill", "scripts/fill-managerial-template.py")
fill = importlib.util.module_from_spec(spec)
spec.loader.exec_module(fill)


class ExcelSemantics(unittest.TestCase):
    def test_missing_answers_are_not_yes_or_no(self):
        for value in [None, "", "Sin dato", "Sin respuesta", "Sin especificar", "No aplica", "No sé", "Ilegible", "Sí/No"]:
            with self.subTest(value=value):
                self.assertEqual(fill.tri(value), "sin")

    def test_affirmative_negative_and_affiliation(self):
        for value in ["Sí", "SI", "Sí, mucho", "Afiliado", "X Sí"]:
            self.assertEqual(fill.tri(value), "si")
        for value in ["No", "NO", "No afiliado", "No, nunca", "X No"]:
            self.assertEqual(fill.tri(value), "no")

    def test_services_preserve_printed_qualifications(self):
        self.assertEqual(fill.canonical_service("Servicio Club Los Corozos (spa, gimnasio)"), "servicio club los corozos")
        self.assertEqual(fill.canonical_service("Servicio de personal de eventos"), "servicio en personal de eventos")
        self.assertIsNone(fill.canonical_service("Inventado"))

    def test_visit_date_formats(self):
        for value in ["05/02/2026", "2026-02-05", "05-02-26", "5 de febrero de 2026"]:
            self.assertEqual(fill.month_of({"general": {"visit_date": value}}), 2)

    def test_formula_injection_is_literal_text(self):
        for value in ["=HYPERLINK(1)", "+SUM(1)", "-1+2", "@SUM(1)"]:
            self.assertEqual(fill.safe_excel_text(value), "'" + value)


if __name__ == "__main__":
    unittest.main()
