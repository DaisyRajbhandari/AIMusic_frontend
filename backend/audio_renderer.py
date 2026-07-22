from __future__ import annotations

from array import array
from hashlib import sha256
from pathlib import Path
import math
import random
import time
import uuid
import wave

from midi_generator import (
    BEATS_PER_BAR,
    _detect_profile,
    _scale_note,
    _triad,
)


SAMPLE_RATE = 22_050
MAX_AMPLITUDE = 32_767


def _midi_frequency(note: int) -> float:
    return 440.0 * (2.0 ** ((note - 69) / 12.0))


def _wave_sample(
    phase: float,
    waveform: str,
) -> float:
    sine = math.sin(phase)

    if waveform == "triangle":
        return (2.0 / math.pi) * math.asin(sine)

    if waveform == "soft_square":
        return math.tanh(2.2 * sine)

    if waveform == "saw":
        cycle = (phase / (2.0 * math.pi)) % 1.0
        return 2.0 * cycle - 1.0

    return sine


def _add_tone(
    mix: array,
    start_seconds: float,
    duration_seconds: float,
    midi_note: int,
    amplitude: float,
    waveform: str = "sine",
) -> None:
    if duration_seconds <= 0:
        return

    start_index = max(
        0,
        int(start_seconds * SAMPLE_RATE),
    )

    sample_count = max(
        1,
        int(duration_seconds * SAMPLE_RATE),
    )

    end_index = min(
        len(mix),
        start_index + sample_count,
    )

    frequency = _midi_frequency(midi_note)
    phase_increment = (
        2.0 * math.pi * frequency / SAMPLE_RATE
    )

    attack_samples = max(
        1,
        min(
            sample_count // 4,
            int(0.025 * SAMPLE_RATE),
        ),
    )

    release_samples = max(
        1,
        min(
            sample_count // 3,
            int(0.12 * SAMPLE_RATE),
        ),
    )

    phase = 0.0

    for absolute_index in range(
        start_index,
        end_index,
    ):
        local_index = (
            absolute_index - start_index
        )

        if local_index < attack_samples:
            envelope = (
                local_index / attack_samples
            )
        elif local_index >= (
            sample_count - release_samples
        ):
            envelope = max(
                0.0,
                (
                    sample_count - local_index
                )
                / release_samples,
            )
        else:
            envelope = 1.0

        fundamental = _wave_sample(
            phase,
            waveform,
        )

        harmonic = (
            0.15
            * math.sin(
                phase * 2.0,
            )
        )

        mix[absolute_index] += (
            amplitude
            * envelope
            * (
                fundamental
                + harmonic
            )
        )

        phase += phase_increment


def _add_kick(
    mix: array,
    start_seconds: float,
    amplitude: float,
) -> None:
    duration_seconds = 0.20
    start_index = int(
        start_seconds * SAMPLE_RATE
    )

    sample_count = int(
        duration_seconds * SAMPLE_RATE
    )

    phase = 0.0

    for local_index in range(sample_count):
        absolute_index = (
            start_index + local_index
        )

        if absolute_index >= len(mix):
            break

        progress = (
            local_index / sample_count
        )

        frequency = (
            110.0
            - 70.0 * progress
        )

        phase += (
            2.0
            * math.pi
            * frequency
            / SAMPLE_RATE
        )

        envelope = math.exp(
            -8.0 * progress
        )

        mix[absolute_index] += (
            amplitude
            * envelope
            * math.sin(phase)
        )


def _add_noise_hit(
    mix: array,
    start_seconds: float,
    duration_seconds: float,
    amplitude: float,
    randomizer: random.Random,
    decay: float,
) -> None:
    start_index = int(
        start_seconds * SAMPLE_RATE
    )

    sample_count = int(
        duration_seconds * SAMPLE_RATE
    )

    previous = 0.0

    for local_index in range(sample_count):
        absolute_index = (
            start_index + local_index
        )

        if absolute_index >= len(mix):
            break

        progress = (
            local_index / sample_count
        )

        noise = randomizer.uniform(
            -1.0,
            1.0,
        )

        filtered = (
            noise - 0.55 * previous
        )

        previous = noise

        envelope = math.exp(
            -decay * progress
        )

        mix[absolute_index] += (
            amplitude
            * envelope
            * filtered
        )


def _section_gain(
    section_name: str,
) -> float:
    return {
        "Intro": 0.58,
        "Build": 0.78,
        "Climax": 1.0,
        "Outro": 0.52,
    }.get(section_name, 0.75)


def _apply_echo(
    mix: array,
    delay_seconds: float = 0.22,
    feedback: float = 0.18,
) -> None:
    delay_samples = int(
        delay_seconds * SAMPLE_RATE
    )

    if delay_samples <= 0:
        return

    for index in range(
        delay_samples,
        len(mix),
    ):
        mix[index] += (
            mix[index - delay_samples]
            * feedback
        )


def _write_wav(
    output_path: Path,
    mix: array,
) -> None:
    peak = max(
        1.0,
        max(abs(sample) for sample in mix),
    )

    normalization = (
        MAX_AMPLITUDE
        * 0.88
        / peak
    )

    pcm = array(
        "h",
        (
            int(
                max(
                    -MAX_AMPLITUDE,
                    min(
                        MAX_AMPLITUDE,
                        sample
                        * normalization,
                    ),
                )
            )
            for sample in mix
        ),
    )

    with wave.open(
        str(output_path),
        "wb",
    ) as wav_file:
        wav_file.setnchannels(1)
        wav_file.setsampwidth(2)
        wav_file.setframerate(
            SAMPLE_RATE
        )

        wav_file.writeframes(
            pcm.tobytes()
        )


def generate_audio(
    prompt: str,
    output_directory: str | Path,
) -> dict[str, object]:
    clean_prompt = prompt.strip()

    if not clean_prompt:
        raise ValueError(
            "Prompt is required"
        )

    output_path = Path(
        output_directory
    )

    output_path.mkdir(
        parents=True,
        exist_ok=True,
    )

    profile = _detect_profile(
        clean_prompt
    )

    section_bars = [
        ("Intro", 4),
        ("Build", 8),
        ("Climax", 8),
        ("Outro", 4),
    ]

    total_bars = sum(
        bars
        for _, bars in section_bars
    )

    seconds_per_beat = (
        60.0 / profile.tempo
    )

    seconds_per_bar = (
        seconds_per_beat
        * BEATS_PER_BAR
    )

    total_seconds = (
        total_bars
        * seconds_per_bar
    )

    tail_seconds = 1.5

    total_samples = int(
        (
            total_seconds
            + tail_seconds
        )
        * SAMPLE_RATE
    )

    mix = array(
        "f",
        [0.0],
    ) * total_samples

    seed_bytes = sha256(
        clean_prompt.encode(
            "utf-8"
        )
    ).digest()

    randomizer = random.Random(
        int.from_bytes(
            seed_bytes[:8],
            byteorder="big",
        )
    )

    motif = [
        0,
        2,
        4,
        3,
        2,
        1,
        0,
        4,
    ]

    motif_rotation = (
        randomizer.randrange(
            len(motif)
        )
    )

    motif = (
        motif[motif_rotation:]
        + motif[:motif_rotation]
    )

    absolute_bar = 0

    for section_name, bars in section_bars:
        section_gain = _section_gain(
            section_name
        )

        melody_steps = (
            8
            if section_name
            == "Climax"
            else 4
        )

        melody_step_seconds = (
            seconds_per_bar
            / melody_steps
        )

        for local_bar in range(bars):
            bar_number = (
                absolute_bar
                + local_bar
            )

            bar_start = (
                bar_number
                * seconds_per_bar
            )

            degree = (
                profile
                .progression_degrees[
                    bar_number
                    % len(
                        profile
                        .progression_degrees
                    )
                ]
            )

            chord = _triad(
                profile,
                degree,
                octave_shift=-1,
            )

            chord_amplitude = (
                0.16 * section_gain
            )

            for chord_note in chord:
                _add_tone(
                    mix=mix,
                    start_seconds=bar_start,
                    duration_seconds=(
                        seconds_per_bar
                        * 0.96
                    ),
                    midi_note=chord_note,
                    amplitude=(
                        chord_amplitude
                    ),
                    waveform="triangle",
                )

            if section_name == "Climax":
                _add_tone(
                    mix=mix,
                    start_seconds=bar_start,
                    duration_seconds=(
                        seconds_per_bar
                        * 0.96
                    ),
                    midi_note=chord[0] + 12,
                    amplitude=0.08,
                    waveform="sine",
                )

            bass_root = _scale_note(
                profile,
                degree,
                octave_shift=-2,
            )

            for beat in range(
                BEATS_PER_BAR
            ):
                bass_note = (
                    bass_root + 7
                    if beat == 2
                    else bass_root
                )

                _add_tone(
                    mix=mix,
                    start_seconds=(
                        bar_start
                        + beat
                        * seconds_per_beat
                    ),
                    duration_seconds=(
                        seconds_per_beat
                        * 0.82
                    ),
                    midi_note=bass_note,
                    amplitude=(
                        0.20
                        * section_gain
                    ),
                    waveform="soft_square",
                )

            for step in range(
                melody_steps
            ):
                motif_degree = motif[
                    (
                        bar_number
                        * melody_steps
                        + step
                    )
                    % len(motif)
                ]

                melodic_degree = (
                    degree
                    + motif_degree
                )

                melody_note = _scale_note(
                    profile,
                    melodic_degree,
                    octave_shift=0,
                )

                if (
                    section_name
                    == "Climax"
                    and step in {2, 6}
                ):
                    melody_note += 12

                _add_tone(
                    mix=mix,
                    start_seconds=(
                        bar_start
                        + step
                        * melody_step_seconds
                    ),
                    duration_seconds=(
                        melody_step_seconds
                        * 0.82
                    ),
                    midi_note=melody_note,
                    amplitude=(
                        0.17
                        * section_gain
                    ),
                    waveform="sine",
                )

            drum_steps = 8
            drum_step_seconds = (
                seconds_per_bar
                / drum_steps
            )

            for step in range(
                drum_steps
            ):
                hit_time = (
                    bar_start
                    + step
                    * drum_step_seconds
                )

                if step in {0, 4}:
                    _add_kick(
                        mix,
                        hit_time,
                        0.34 * section_gain,
                    )

                if step in {2, 6}:
                    _add_noise_hit(
                        mix=mix,
                        start_seconds=hit_time,
                        duration_seconds=0.16,
                        amplitude=(
                            0.13
                            * section_gain
                        ),
                        randomizer=randomizer,
                        decay=7.0,
                    )

                hat_amplitude = (
                    0.035
                    if section_name
                    in {"Intro", "Outro"}
                    else 0.060
                )

                _add_noise_hit(
                    mix=mix,
                    start_seconds=hit_time,
                    duration_seconds=0.045,
                    amplitude=(
                        hat_amplitude
                        * section_gain
                    ),
                    randomizer=randomizer,
                    decay=14.0,
                )

        absolute_bar += bars

    _apply_echo(mix)

    timestamp = int(time.time())
    identifier = uuid.uuid4().hex[:10]

    filename = (
        f"soluna-{timestamp}-"
        f"{identifier}.wav"
    )

    full_path = (
        output_path / filename
    )

    _write_wav(
        full_path,
        mix,
    )

    return {
        "filename": filename,
        "full_path": str(full_path),
        "duration_seconds": round(
            total_seconds,
            2,
        ),
        "sample_rate": SAMPLE_RATE,
        "channels": 1,
        "format": "wav",
    }