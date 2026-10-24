"""Pose library: reference joint angles, coaching cues and illustration skeletons.

Angles are *interior* joint angles in degrees (0-180), measured in 3D from
MediaPipe world landmarks, so they are largely independent of camera angle.

Joint definitions (landmark triplets, vertex in the middle):
  elbow    = shoulder - elbow - wrist
  shoulder = hip - shoulder - elbow
  hip      = shoulder - hip - knee
  knee     = hip - knee - ankle

`mirror: true` means the pose may be performed on either side; the client
scores both orientations and keeps the better one.

`figure` is a 2D stick figure in a 100x100 box (y grows downwards) used to
draw the pose illustration. Front-view figures are drawn as the camera sees
the person, so the person's left side appears on the right.
"""

from typing import Final

JOINTS: Final = (
    "left_elbow",
    "right_elbow",
    "left_shoulder",
    "right_shoulder",
    "left_hip",
    "right_hip",
    "left_knee",
    "right_knee",
)


def _t(joint: str, angle: float, tolerance: float, weight: float = 1.0) -> dict:
    return {"joint": joint, "angle": angle, "tolerance": tolerance, "weight": weight}


def _both(kind: str, angle: float, tolerance: float, weight: float = 1.0) -> list[dict]:
    return [_t(f"left_{kind}", angle, tolerance, weight), _t(f"right_{kind}", angle, tolerance, weight)]


POSES: Final[list[dict]] = [
    {
        "id": "tadasana",
        "name": "Mountain Pose",
        "sanskrit": "Tadasana",
        "level": "beginner",
        "view": "front",
        "mirror": False,
        "hold_seconds": 20,
        "focus": ["Posture", "Balance", "Grounding"],
        "description": "The foundation of every standing pose. Stand tall, weight even across both feet, arms relaxed by your sides.",
        "cues": [
            "Feet hip-width apart, toes pointing forward",
            "Engage your thighs and lengthen your spine",
            "Relax your shoulders down and away from your ears",
        ],
        "targets": [
            *_both("elbow", 172, 15),
            *_both("shoulder", 18, 15),
            *_both("hip", 176, 10, 1.5),
            *_both("knee", 177, 10, 1.5),
        ],
        "figure": {
            "head": [50, 12],
            "left_shoulder": [58, 24],
            "right_shoulder": [42, 24],
            "left_elbow": [61, 40],
            "right_elbow": [39, 40],
            "left_wrist": [62, 54],
            "right_wrist": [38, 54],
            "left_hip": [55, 54],
            "right_hip": [45, 54],
            "left_knee": [55, 72],
            "right_knee": [45, 72],
            "left_ankle": [55, 90],
            "right_ankle": [45, 90],
        },
    },
    {
        "id": "vrksasana",
        "name": "Tree Pose",
        "sanskrit": "Vrksasana",
        "level": "intermediate",
        "view": "front",
        "mirror": True,
        "hold_seconds": 25,
        "focus": ["Balance", "Focus", "Hip opening"],
        "description": "Balance on one leg with the other foot pressed into the inner thigh, hands reaching overhead.",
        "cues": [
            "Root down through your standing foot",
            "Press foot and thigh into each other",
            "Open the bent knee out to the side",
            "Reach your arms up, palms together",
        ],
        "targets": [
            _t("right_knee", 177, 10, 2.0),
            _t("right_hip", 175, 12, 1.5),
            _t("left_knee", 45, 25, 1.5),
            _t("left_hip", 130, 30),
            *_both("shoulder", 165, 20),
            *_both("elbow", 150, 30, 0.5),
        ],
        "figure": {
            "head": [50, 22],
            "left_shoulder": [57, 32],
            "right_shoulder": [43, 32],
            "left_elbow": [59, 18],
            "right_elbow": [41, 18],
            "left_wrist": [51, 6],
            "right_wrist": [49, 6],
            "left_hip": [55, 58],
            "right_hip": [45, 58],
            "left_knee": [68, 70],
            "right_knee": [45, 76],
            "left_ankle": [49, 70],
            "right_ankle": [45, 94],
        },
    },
    {
        "id": "utkatasana",
        "name": "Chair Pose",
        "sanskrit": "Utkatasana",
        "level": "beginner",
        "view": "side",
        "mirror": False,
        "hold_seconds": 20,
        "focus": ["Strength", "Legs", "Endurance"],
        "description": "Sit back into an imaginary chair with arms reaching up, building heat in the legs and core.",
        "cues": [
            "Sit your hips back and down",
            "Keep your knees behind your toes",
            "Reach your arms up alongside your ears",
        ],
        "targets": [
            *_both("knee", 110, 15, 1.5),
            *_both("hip", 95, 20, 1.5),
            *_both("shoulder", 165, 20),
            *_both("elbow", 172, 15, 0.5),
        ],
        "figure": {
            "head": [61, 29],
            "left_shoulder": [51, 36],
            "right_shoulder": [49, 37],
            "left_elbow": [55, 18],
            "right_elbow": [53, 19],
            "left_wrist": [59, 2],
            "right_wrist": [57, 3],
            "left_hip": [36, 62],
            "right_hip": [34, 63],
            "left_knee": [66, 76],
            "right_knee": [64, 77],
            "left_ankle": [47, 94],
            "right_ankle": [45, 94],
        },
    },
    {
        "id": "virabhadrasana_ii",
        "name": "Warrior II",
        "sanskrit": "Virabhadrasana II",
        "level": "intermediate",
        "view": "front",
        "mirror": True,
        "hold_seconds": 30,
        "focus": ["Strength", "Stamina", "Hip opening"],
        "description": "A wide, powerful stance with the front knee bent and arms stretched long in opposite directions.",
        "cues": [
            "Bend your front knee to about 90 degrees",
            "Keep your back leg strong and straight",
            "Stretch your arms parallel to the floor",
            "Gaze softly over your front fingertips",
        ],
        "targets": [
            _t("left_knee", 95, 15, 2.0),
            _t("right_knee", 177, 10, 1.5),
            _t("left_hip", 100, 25),
            _t("right_hip", 135, 25),
            *_both("shoulder", 90, 15, 1.2),
            *_both("elbow", 175, 12),
        ],
        "figure": {
            "head": [50, 20],
            "left_shoulder": [57, 32],
            "right_shoulder": [43, 32],
            "left_elbow": [72, 32],
            "right_elbow": [28, 32],
            "left_wrist": [88, 32],
            "right_wrist": [12, 32],
            "left_hip": [54, 56],
            "right_hip": [46, 56],
            "left_knee": [72, 64],
            "right_knee": [32, 72],
            "left_ankle": [72, 90],
            "right_ankle": [18, 90],
        },
    },
    {
        "id": "trikonasana",
        "name": "Triangle Pose",
        "sanskrit": "Trikonasana",
        "level": "intermediate",
        "view": "front",
        "mirror": True,
        "hold_seconds": 25,
        "focus": ["Flexibility", "Side body", "Hamstrings"],
        "description": "Legs wide and straight, the torso tilts over the front leg while the arms form one vertical line.",
        "cues": [
            "Keep both legs straight",
            "Hinge sideways at the hip over your front leg",
            "Stack your arms in one line, top hand to the sky",
        ],
        "targets": [
            *_both("knee", 176, 12, 1.5),
            *_both("shoulder", 95, 20, 1.2),
            *_both("elbow", 175, 12),
            _t("left_hip", 100, 25),
            _t("right_hip", 140, 25),
        ],
        "figure": {
            "head": [78, 27],
            "left_shoulder": [73, 42],
            "right_shoulder": [67, 30],
            "left_elbow": [74, 56],
            "right_elbow": [66, 16],
            "left_wrist": [75, 70],
            "right_wrist": [65, 2],
            "left_hip": [56, 58],
            "right_hip": [46, 58],
            "left_knee": [68, 75],
            "right_knee": [34, 75],
            "left_ankle": [80, 92],
            "right_ankle": [22, 92],
        },
    },
    {
        "id": "adho_mukha_svanasana",
        "name": "Downward Dog",
        "sanskrit": "Adho Mukha Svanasana",
        "level": "beginner",
        "view": "side",
        "mirror": False,
        "hold_seconds": 30,
        "focus": ["Full-body stretch", "Shoulders", "Hamstrings"],
        "description": "An inverted V: hands and feet grounded, hips lifted high, spine long.",
        "cues": [
            "Press firmly through your palms",
            "Lift your hips up and back",
            "Straighten your legs, heels reaching down",
            "Keep your arms in line with your torso",
        ],
        "targets": [
            *_both("elbow", 174, 12),
            *_both("shoulder", 170, 15, 1.2),
            *_both("hip", 72, 20, 1.5),
            *_both("knee", 174, 14, 1.2),
        ],
        "figure": {
            "head": [32, 72],
            "left_shoulder": [30, 60],
            "right_shoulder": [28, 61],
            "left_elbow": [20, 76],
            "right_elbow": [18, 77],
            "left_wrist": [12, 90],
            "right_wrist": [10, 90],
            "left_hip": [55, 30],
            "right_hip": [53, 31],
            "left_knee": [68, 60],
            "right_knee": [66, 61],
            "left_ankle": [80, 90],
            "right_ankle": [78, 90],
        },
    },
    {
        "id": "phalakasana",
        "name": "Plank Pose",
        "sanskrit": "Phalakasana",
        "level": "beginner",
        "view": "side",
        "mirror": False,
        "hold_seconds": 30,
        "focus": ["Core", "Arms", "Stability"],
        "description": "A straight line from head to heels, supported on straight arms with shoulders over wrists.",
        "cues": [
            "Stack your shoulders over your wrists",
            "Keep a straight line from head to heels",
            "Don't let your hips sag or pike up",
        ],
        "targets": [
            *_both("elbow", 174, 12),
            *_both("shoulder", 85, 15, 1.2),
            *_both("hip", 174, 10, 2.0),
            *_both("knee", 175, 10),
        ],
        "figure": {
            "head": [12, 58],
            "left_shoulder": [20, 64],
            "right_shoulder": [21, 65],
            "left_elbow": [20, 77],
            "right_elbow": [21, 78],
            "left_wrist": [20, 90],
            "right_wrist": [21, 90],
            "left_hip": [55, 70],
            "right_hip": [56, 71],
            "left_knee": [72, 76],
            "right_knee": [73, 77],
            "left_ankle": [90, 82],
            "right_ankle": [91, 83],
        },
    },
    {
        "id": "balasana",
        "name": "Child's Pose",
        "sanskrit": "Balasana",
        "level": "beginner",
        "view": "side",
        "mirror": False,
        "hold_seconds": 30,
        "focus": ["Rest", "Lower back", "Calm"],
        "description": "A restful fold: sit back on your heels, chest toward the thighs, arms reaching forward.",
        "cues": [
            "Sit your hips back towards your heels",
            "Rest your chest on your thighs",
            "Stretch your arms long in front of you",
        ],
        "targets": [
            *_both("knee", 30, 20, 1.5),
            *_both("hip", 35, 20, 1.5),
            *_both("shoulder", 160, 25),
            *_both("elbow", 168, 20, 0.5),
        ],
        "figure": {
            "head": [32, 82],
            "left_shoulder": [42, 72],
            "right_shoulder": [43, 73],
            "left_elbow": [24, 82],
            "right_elbow": [25, 83],
            "left_wrist": [8, 88],
            "right_wrist": [9, 89],
            "left_hip": [74, 80],
            "right_hip": [75, 81],
            "left_knee": [42, 90],
            "right_knee": [43, 91],
            "left_ankle": [78, 92],
            "right_ankle": [79, 93],
        },
    },
]

POSE_IDS: Final[frozenset[str]] = frozenset(p["id"] for p in POSES)
