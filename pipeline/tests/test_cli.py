from so101_pipeline.cli import main


def test_version_flag(capsys):
    assert main(["--version"]) == 0
    assert "so101-pipeline" in capsys.readouterr().out
