import math
import pathlib
import sys
import unittest

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1]))

from curvefinder_core import analyze_points, count_bends, signed_menger_curvature


class CurveFinderCoreTests(unittest.TestCase):
    def test_circle_curvature_matches_reciprocal_radius(self):
        radius = 50.0
        curvature = signed_menger_curvature(
            (radius, 0),
            (radius * math.cos(math.pi / 4), radius * math.sin(math.pi / 4)),
            (0, radius),
        )
        self.assertAlmostEqual(curvature, 1 / radius)

    def test_straight_line_has_no_bends(self):
        samples = analyze_points([(index * 5, 0) for index in range(7)], span=1)
        self.assertEqual(count_bends(samples), 0)
        self.assertTrue(all(sample.radius_m is None for sample in samples))

    def test_quarter_circle_is_one_bend(self):
        radius = 50.0
        points = [
            (
                radius * math.cos((math.pi / 2) * index / 8),
                radius * math.sin((math.pi / 2) * index / 8),
            )
            for index in range(9)
        ]
        samples = analyze_points(points, span=1, straight_threshold=0.0001)
        radii = [sample.radius_m for sample in samples if sample.radius_m is not None]
        self.assertTrue(all(abs(radius_value - radius) < 1e-8 for radius_value in radii))
        self.assertEqual(count_bends(samples), 1)


if __name__ == "__main__":
    unittest.main()
