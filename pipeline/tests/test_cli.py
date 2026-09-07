from so101_pipeline.cli import main


def test_version_flag(capsys):
    assert main(["--version"]) == 0
    assert "so101-pipeline" in capsys.readouterr().out


def test_default_is_not_implemented():
    assert main([]) == 2
