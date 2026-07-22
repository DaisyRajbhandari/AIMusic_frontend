from __future__ import annotations

from dataclasses import dataclass
from hashlib import sha256
from pathlib import Path
import random
import struct
import time
import uuid


TICKS_PER_BEAT = 480
BEATS_PER_BAR = 4
TICKS_PER_BAR = TICKS_PER_BEAT * BEATS_PER_BAR

NOTE_ON = 0x90
NOTE_OFF = 0x80
PROGRAM_CHANGE = 0xC0

CHANNEL_HARMONY = 0
CHANNEL_MELODY = 1
CHANNEL_BASS = 2
CHANNEL_DRUMS = 9


@dataclass(frozen=True)
class MusicProfile:
    mood: str
    genre: str
    tempo: int
    key_name: str
    root_midi: int
    scale_intervals: tuple[int, ...]
    progression_degrees: tuple[int, ...]
    harmony_program: int
    melody_program: int
    bass_program: int


def _variable_length(value: int) -> bytes:
    """Encode an integer using the MIDI variable-length quantity format."""
    value = max(0, int(value))
    buffer = value & 0x7F

    while value >> 7:
        value >>= 7
        buffer <<= 8
        buffer |= ((value & 0x7F) | 0x80)

    result = bytearray()

    while True:
        result.append(buffer & 0xFF)

        if buffer & 0x80:
            buffer >>= 8
        else:
            break

    return bytes(result)


def _event(delta_ticks: int, payload: bytes) -> bytes:
    return _variable_length(delta_ticks) + payload


def _meta_event(delta_ticks: int, meta_type: int, data: bytes) -> bytes:
    return (
        _variable_length(delta_ticks)
        + bytes([0xFF, meta_type])
        + _variable_length(len(data))
        + data
    )


def _track_chunk(events: list[bytes]) -> bytes:
    track_data = b"".join(events)
    track_data += _meta_event(0, 0x2F, b"")
    return b"MTrk" + struct.pack(">I", len(track_data)) + track_data


def _tempo_bytes(bpm: int) -> bytes:
    microseconds_per_beat = round(60_000_000 / bpm)
    return microseconds_per_beat.to_bytes(3, byteorder="big")


def _detect_profile(prompt: str) -> MusicProfile:
    text = prompt.lower()

    is_sad = any(
        word in text
        for word in ("sad", "melancholy", "dark", "lonely", "emotional", "tragic")
    )
    is_calm = any(
        word in text
        for word in ("calm", "soft", "ambient", "relaxing", "peaceful", "slow")
    )
    is_epic = any(
        word in text
        for word in ("epic", "cinematic", "powerful", "battle", "heroic", "trailer")
    )
    is_electronic = any(
        word in text
        for word in ("electronic", "edm", "synth", "techno", "house", "gaming")
    )
    is_rock = any(
        word in text
        for word in ("rock", "guitar", "band", "metal", "jrock")
    )
    is_lofi = any(
        word in text
        for word in ("lo-fi", "lofi", "study", "chill", "jazzy")
    )

    if is_epic:
        return MusicProfile(
            mood="epic",
            genre="cinematic",
            tempo=128,
            key_name="D minor",
            root_midi=62,
            scale_intervals=(0, 2, 3, 5, 7, 8, 10),
            progression_degrees=(0, 5, 2, 6),
            harmony_program=48,
            melody_program=56,
            bass_program=43,
        )

    if is_electronic:
        return MusicProfile(
            mood="energetic",
            genre="electronic",
            tempo=126,
            key_name="A minor",
            root_midi=57,
            scale_intervals=(0, 2, 3, 5, 7, 8, 10),
            progression_degrees=(0, 5, 2, 6),
            harmony_program=89,
            melody_program=81,
            bass_program=38,
        )

    if is_rock:
        return MusicProfile(
            mood="energetic",
            genre="rock",
            tempo=138,
            key_name="E minor",
            root_midi=64,
            scale_intervals=(0, 2, 3, 5, 7, 8, 10),
            progression_degrees=(0, 5, 2, 6),
            harmony_program=29,
            melody_program=30,
            bass_program=33,
        )

    if is_lofi:
        return MusicProfile(
            mood="calm",
            genre="lo-fi",
            tempo=78,
            key_name="C major",
            root_midi=60,
            scale_intervals=(0, 2, 4, 5, 7, 9, 11),
            progression_degrees=(0, 5, 1, 4),
            harmony_program=4,
            melody_program=11,
            bass_program=33,
        )

    if is_sad:
        return MusicProfile(
            mood="sad",
            genre="classical",
            tempo=72,
            key_name="A minor",
            root_midi=57,
            scale_intervals=(0, 2, 3, 5, 7, 8, 10),
            progression_degrees=(0, 5, 2, 6),
            harmony_program=0,
            melody_program=40,
            bass_program=42,
        )

    if is_calm:
        return MusicProfile(
            mood="calm",
            genre="ambient classical",
            tempo=76,
            key_name="C major",
            root_midi=60,
            scale_intervals=(0, 2, 4, 5, 7, 9, 11),
            progression_degrees=(0, 4, 5, 3),
            harmony_program=0,
            melody_program=48,
            bass_program=43,
        )

    return MusicProfile(
        mood="happy",
        genre="pop",
        tempo=116,
        key_name="C major",
        root_midi=60,
        scale_intervals=(0, 2, 4, 5, 7, 9, 11),
        progression_degrees=(0, 4, 5, 3),
        harmony_program=0,
        melody_program=81,
        bass_program=33,
    )


def _scale_note(profile: MusicProfile, degree: int, octave_shift: int = 0) -> int:
    scale_length = len(profile.scale_intervals)
    octave, position = divmod(degree, scale_length)

    return (
        profile.root_midi
        + profile.scale_intervals[position]
        + 12 * (octave + octave_shift)
    )


def _triad(profile: MusicProfile, degree: int, octave_shift: int = 0) -> tuple[int, int, int]:
    return (
        _scale_note(profile, degree, octave_shift),
        _scale_note(profile, degree + 2, octave_shift),
        _scale_note(profile, degree + 4, octave_shift),
    )


def _note_events(
    channel: int,
    note: int,
    velocity: int,
    duration_ticks: int,
    delta_before: int = 0,
) -> list[bytes]:
    safe_note = max(0, min(127, int(note)))
    safe_velocity = max(1, min(127, int(velocity)))

    return [
        _event(
            delta_before,
            bytes([NOTE_ON | channel, safe_note, safe_velocity]),
        ),
        _event(
            duration_ticks,
            bytes([NOTE_OFF | channel, safe_note, 0]),
        ),
    ]


def _simultaneous_notes(
    channel: int,
    notes: tuple[int, ...] | list[int],
    velocity: int,
    duration_ticks: int,
    delta_before: int = 0,
) -> list[bytes]:
    events: list[bytes] = []

    for index, note in enumerate(notes):
        events.append(
            _event(
                delta_before if index == 0 else 0,
                bytes(
                    [
                        NOTE_ON | channel,
                        max(0, min(127, int(note))),
                        max(1, min(127, int(velocity))),
                    ]
                ),
            )
        )

    for index, note in enumerate(notes):
        events.append(
            _event(
                duration_ticks if index == 0 else 0,
                bytes(
                    [
                        NOTE_OFF | channel,
                        max(0, min(127, int(note))),
                        0,
                    ]
                ),
            )
        )

    return events


def _build_tempo_track(profile: MusicProfile, total_bars: int) -> bytes:
    events = [
        _meta_event(0, 0x03, b"SoLuna Tempo"),
        _meta_event(0, 0x51, _tempo_bytes(profile.tempo)),
        _meta_event(0, 0x58, bytes([4, 2, 24, 8])),
        _meta_event(0, 0x59, bytes([0, 0])),
        _meta_event(total_bars * TICKS_PER_BAR, 0x01, b"Generated by SoLuna"),
    ]

    return _track_chunk(events)


def _build_harmony_track(
    profile: MusicProfile,
    section_bars: list[tuple[str, int]],
) -> bytes:
    events = [
        _meta_event(0, 0x03, b"Harmony"),
        _event(
            0,
            bytes([PROGRAM_CHANGE | CHANNEL_HARMONY, profile.harmony_program]),
        ),
    ]

    bar_index = 0

    for section_name, bars in section_bars:
        events.append(_meta_event(0, 0x06, section_name.encode("utf-8")))

        for local_bar in range(bars):
            degree = profile.progression_degrees[
                (bar_index + local_bar) % len(profile.progression_degrees)
            ]

            chord = _triad(profile, degree, octave_shift=-1)

            if section_name == "Climax":
                chord = tuple(list(chord) + [chord[0] + 12])

            velocity = {
                "Intro": 56,
                "Build": 70,
                "Climax": 92,
                "Outro": 52,
            }.get(section_name, 70)

            events.extend(
                _simultaneous_notes(
                    CHANNEL_HARMONY,
                    chord,
                    velocity,
                    TICKS_PER_BAR,
                )
            )

        bar_index += bars

    return _track_chunk(events)


def _build_bass_track(
    profile: MusicProfile,
    section_bars: list[tuple[str, int]],
) -> bytes:
    events = [
        _meta_event(0, 0x03, b"Bass"),
        _event(
            0,
            bytes([PROGRAM_CHANGE | CHANNEL_BASS, profile.bass_program]),
        ),
    ]

    bar_index = 0

    for section_name, bars in section_bars:
        events.append(_meta_event(0, 0x06, section_name.encode("utf-8")))

        for local_bar in range(bars):
            degree = profile.progression_degrees[
                (bar_index + local_bar) % len(profile.progression_degrees)
            ]

            root_note = _scale_note(profile, degree, octave_shift=-2)
            velocity = 54 if section_name in {"Intro", "Outro"} else 78

            for beat in range(BEATS_PER_BAR):
                events.extend(
                    _note_events(
                        CHANNEL_BASS,
                        root_note if beat != 2 else root_note + 7,
                        velocity,
                        TICKS_PER_BEAT,
                    )
                )

        bar_index += bars

    return _track_chunk(events)


def _build_melody_track(
    profile: MusicProfile,
    section_bars: list[tuple[str, int]],
    randomizer: random.Random,
) -> bytes:
    events = [
        _meta_event(0, 0x03, b"Melody"),
        _event(
            0,
            bytes([PROGRAM_CHANGE | CHANNEL_MELODY, profile.melody_program]),
        ),
    ]

    motif = [0, 2, 4, 3, 2, 1, 0, 4]
    motif_rotation = randomizer.randrange(len(motif))
    motif = motif[motif_rotation:] + motif[:motif_rotation]

    bar_index = 0

    for section_name, bars in section_bars:
        events.append(_meta_event(0, 0x06, section_name.encode("utf-8")))

        notes_per_bar = 4 if section_name != "Climax" else 8
        duration = TICKS_PER_BAR // notes_per_bar

        for local_bar in range(bars):
            progression_degree = profile.progression_degrees[
                (bar_index + local_bar) % len(profile.progression_degrees)
            ]

            for step in range(notes_per_bar):
                motif_degree = motif[
                    (bar_index * notes_per_bar + step) % len(motif)
                ]

                melodic_degree = progression_degree + motif_degree
                note = _scale_note(profile, melodic_degree, octave_shift=0)

                if section_name == "Climax" and step in {2, 6}:
                    note += 12

                velocity = {
                    "Intro": 58,
                    "Build": 74,
                    "Climax": 100,
                    "Outro": 54,
                }.get(section_name, 72)

                velocity += randomizer.randint(-5, 5)

                events.extend(
                    _note_events(
                        CHANNEL_MELODY,
                        note,
                        velocity,
                        duration,
                    )
                )

        bar_index += bars

    return _track_chunk(events)


def _build_drum_track(
    section_bars: list[tuple[str, int]],
) -> bytes:
    events = [_meta_event(0, 0x03, b"Drums")]

    for section_name, bars in section_bars:
        events.append(_meta_event(0, 0x06, section_name.encode("utf-8")))

        for _ in range(bars):
            steps_per_bar = 8
            step_duration = TICKS_PER_BAR // steps_per_bar

            for step in range(steps_per_bar):
                notes = [42]  # Closed hi-hat

                if step in {0, 4}:
                    notes.append(36)  # Kick

                if step in {2, 6}:
                    notes.append(38)  # Snare

                if section_name == "Climax" and step in {1, 3, 5, 7}:
                    notes.append(46)  # Open hi-hat

                velocity = 45 if section_name in {"Intro", "Outro"} else 78

                events.extend(
                    _simultaneous_notes(
                        CHANNEL_DRUMS,
                        notes,
                        velocity,
                        step_duration,
                    )
                )

    return _track_chunk(events)


def generate_midi(
    prompt: str,
    output_directory: str | Path,
) -> dict[str, object]:
    clean_prompt = prompt.strip()

    if not clean_prompt:
        raise ValueError("Prompt is required")

    output_path = Path(output_directory)
    output_path.mkdir(parents=True, exist_ok=True)

    profile = _detect_profile(clean_prompt)

    seed_bytes = sha256(clean_prompt.encode("utf-8")).digest()
    seed = int.from_bytes(seed_bytes[:8], byteorder="big")
    randomizer = random.Random(seed)

    section_bars = [
        ("Intro", 4),
        ("Build", 8),
        ("Climax", 8),
        ("Outro", 4),
    ]

    total_bars = sum(bars for _, bars in section_bars)

    header = (
        b"MThd"
        + struct.pack(">IHHH", 6, 1, 5, TICKS_PER_BEAT)
    )

    midi_data = b"".join(
        [
            header,
            _build_tempo_track(profile, total_bars),
            _build_harmony_track(profile, section_bars),
            _build_bass_track(profile, section_bars),
            _build_melody_track(profile, section_bars, randomizer),
            _build_drum_track(section_bars),
        ]
    )

    timestamp = int(time.time())
    identifier = uuid.uuid4().hex[:10]
    filename = f"soluna-{timestamp}-{identifier}.mid"
    full_path = output_path / filename
    full_path.write_bytes(midi_data)

    return {
        "filename": filename,
        "full_path": str(full_path),
        "mood": profile.mood,
        "genre": profile.genre,
        "tempo": profile.tempo,
        "key": profile.key_name,
        "instrumentation": [
            "harmony",
            "melody",
            "bass",
            "drums",
        ],
        "sections": [
            {
                "name": section_name,
                "bars": bars,
            }
            for section_name, bars in section_bars
        ],
        "total_bars": total_bars,
    }