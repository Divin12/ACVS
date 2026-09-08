from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('certificates', '0001_initial'),
    ]

    operations = [
        migrations.AddField(
            model_name='certificate',
            name='tx_hash',
            field=models.CharField(blank=True, default='', max_length=66),
        ),
    ]
